import { getRepository } from 'typeorm';
import { User } from '../../entity/User';
import JellyfinAPI, { JellyfinLibraryItem } from '../../api/jellyfin';
import TheMovieDb from '../../api/themoviedb';
import { TmdbTvDetails } from '../../api/themoviedb/interfaces';
import Media from '../../entity/Media';
import { MediaStatus, MediaType } from '../../constants/media';
import logger from '../../logger';
import { getSettings, Library } from '../../lib/settings';
import Season from '../../entity/Season';
import { uniqWith } from 'lodash';
import { v4 as uuid } from 'uuid';
import AsyncLock from '../../utils/asyncLock';
import { MediaServerType } from '../../constants/server';

const BUNDLE_SIZE = 20;
const UPDATE_RATE = 4 * 1000;

interface SyncStatus {
  running: boolean;
  progress: number;
  total: number;
  currentLibrary: Library;
  libraries: Library[];
}

class JobJellyfinSync {
  private sessionId: string;
  private tmdb: TheMovieDb;
  private jfClient: JellyfinAPI;
  private items: JellyfinLibraryItem[] = [];
  private progress = 0;
  private libraries: Library[];
  private currentLibrary: Library;
  private running = false;
  private isRecentOnly = false;
  private enable4kMovie = false;
  private enable4kShow = false;
  private asyncLock = new AsyncLock();

  constructor({ isRecentOnly }: { isRecentOnly?: boolean } = {}) {
    this.tmdb = new TheMovieDb();
    this.isRecentOnly = isRecentOnly ?? false;
  }

  private async getExisting(tmdbId: number, mediaType: MediaType) {
    const mediaRepository = getRepository(Media);

    const existing = await mediaRepository.findOne({
      where: { tmdbId: tmdbId, mediaType },
    });

    return existing;
  }

  private async processMovie(jellyfinitem: JellyfinLibraryItem) {
    const mediaRepository = getRepository(Media);

    try {
      const metadata = await this.jfClient.getItemData(jellyfinitem.Id);
      const newMedia = new Media();

      if (!metadata.Id) {
        logger.debug('No Id metadata for this title. Skipping', {
          label: 'Plex Sync',
          ratingKey: jellyfinitem.Id,
        });
        return;
      }

      newMedia.tmdbId = Number(metadata.ProviderIds.Tmdb ?? null);
      newMedia.imdbId = metadata.ProviderIds.Imdb;
      if (newMedia.imdbId && !isNaN(newMedia.tmdbId)) {
        const tmdbMovie = await this.tmdb.getMovieByImdbId({
          imdbId: newMedia.imdbId,
        });
        newMedia.tmdbId = tmdbMovie.id;
      }
      if (!newMedia.tmdbId) {
        throw new Error('Unable to find TMDb ID');
      }

      const has4k = metadata.MediaSources?.some((MediaSource) => {
        return MediaSource.MediaStreams.some((MediaStream) => {
          return (MediaStream.Width ?? 0) > 2000;
        });
      });

      const hasOtherResolution = metadata.MediaSources?.some((MediaSource) => {
        return MediaSource.MediaStreams.some((MediaStream) => {
          return (MediaStream.Width ?? 0) <= 2000;
        });
      });

      await this.asyncLock.dispatch(newMedia.tmdbId, async () => {
        const existing = await this.getExisting(
          newMedia.tmdbId,
          MediaType.MOVIE
        );

        if (existing) {
          let changedExisting = false;

          if (
            (hasOtherResolution || (!this.enable4kMovie && has4k)) &&
            existing.status !== MediaStatus.AVAILABLE
          ) {
            existing.status = MediaStatus.AVAILABLE;
            existing.mediaAddedAt = new Date(metadata.DateCreated ?? '');
            changedExisting = true;
          }

          if (
            has4k &&
            this.enable4kMovie &&
            existing.status4k !== MediaStatus.AVAILABLE
          ) {
            existing.status4k = MediaStatus.AVAILABLE;
            changedExisting = true;
          }

          if (!existing.mediaAddedAt && !changedExisting) {
            existing.mediaAddedAt = new Date(metadata.DateCreated ?? '');
            changedExisting = true;
          }

          if (
            (hasOtherResolution || (has4k && !this.enable4kMovie)) &&
            existing.jellyfinMediaId !== metadata.Id
          ) {
            existing.jellyfinMediaId = metadata.Id;
            changedExisting = true;
          }

          if (
            has4k &&
            this.enable4kMovie &&
            existing.jellyfinMediaId4k !== metadata.Id
          ) {
            existing.jellyfinMediaId4k = metadata.Id;
            changedExisting = true;
          }

          if (changedExisting) {
            await mediaRepository.save(existing);
            this.log(
              `Request for ${metadata.Name} exists. New media types set to AVAILABLE`,
              'info'
            );
          } else {
            this.log(
              `Title already exists and no new media types found ${metadata.Name}`
            );
          }
        } else {
          newMedia.status =
            hasOtherResolution || (!this.enable4kMovie && has4k)
              ? MediaStatus.AVAILABLE
              : MediaStatus.UNKNOWN;
          newMedia.status4k =
            has4k && this.enable4kMovie
              ? MediaStatus.AVAILABLE
              : MediaStatus.UNKNOWN;
          newMedia.mediaType = MediaType.MOVIE;
          newMedia.mediaAddedAt = new Date(metadata.DateCreated ?? '');
          newMedia.jellyfinMediaId =
            hasOtherResolution || (!this.enable4kMovie && has4k)
              ? metadata.Id
              : undefined;
          newMedia.jellyfinMediaId4k =
            has4k && this.enable4kMovie ? metadata.Id : undefined;
          await mediaRepository.save(newMedia);
          this.log(`Saved ${metadata.Name}`);
        }
      });
    } catch (e) {
      this.log(
        `Failed to process Jellyfin item, id: ${jellyfinitem.Id}`,
        'error',
        {
          errorMessage: e.message,
          jellyfinitem,
        }
      );
    }
  }

  private async processShow(jellyfinitem: JellyfinLibraryItem) {
    const mediaRepository = getRepository(Media);

    let tvShow: TmdbTvDetails | null = null;

    try {
      const Id =
        jellyfinitem.SeriesId ?? jellyfinitem.SeasonId ?? jellyfinitem.Id;
      const metadata = await this.jfClient.getItemData(Id);

      if (metadata.ProviderIds.Tvdb) {
        tvShow = await this.tmdb.getShowByTvdbId({
          tvdbId: Number(metadata.ProviderIds.Tvdb),
        });
      } else if (metadata.ProviderIds.Tmdb) {
        tvShow = await this.tmdb.getTvShow({
          tvId: Number(metadata.ProviderIds.Tmdb),
        });
      }

      if (tvShow) {
        await this.asyncLock.dispatch(tvShow.id, async () => {
          if (!tvShow) {
            // this will never execute, but typescript thinks somebody could reset tvShow from
            // outer scope back to null before this async gets called
            return;
          }

          // Lets get the available seasons from Jellyfin
          const seasons = tvShow.seasons;
          const media = await this.getExisting(tvShow.id, MediaType.TV);

          const newSeasons: Season[] = [];

          const currentStandardSeasonAvailable = (
            media?.seasons.filter(
              (season) => season.status === MediaStatus.AVAILABLE
            ) ?? []
          ).length;
          const current4kSeasonAvailable = (
            media?.seasons.filter(
              (season) => season.status4k === MediaStatus.AVAILABLE
            ) ?? []
          ).length;

          for (const season of seasons) {
            const JellyfinSeasons = await this.jfClient.getSeasons(Id);
            const matchedJellyfinSeason = JellyfinSeasons.find(
              (md) => Number(md.IndexNumber) === season.season_number
            );

            const existingSeason = media?.seasons.find(
              (es) => es.seasonNumber === season.season_number
            );

            // Check if we found the matching season and it has all the available episodes
            if (matchedJellyfinSeason) {
              // If we have a matched Jellyfin season, get its children metadata so we can check details
              const episodes = await this.jfClient.getEpisodes(
                Id,
                matchedJellyfinSeason.Id
              );

              //Get count of episodes that are HD and 4K
              let totalStandard = 0;
              let total4k = 0;

              //use for loop to make sure this loop _completes_ in full
              //before the next section
              for (const episode of episodes) {
                if (!this.enable4kShow) {
                  totalStandard++;
                } else {
                  const ExtendedEpisodeData = await this.jfClient.getItemData(
                    episode.Id
                  );

                  ExtendedEpisodeData.MediaSources?.some((MediaSource) => {
                    return MediaSource.MediaStreams.some((MediaStream) => {
                      if (MediaStream.Type === 'Video') {
                        if (MediaStream.Width ?? 0 < 2000) {
                          totalStandard++;
                        }
                      } else {
                        total4k++;
                      }
                    });
                  });
                }
              }

              if (
                media &&
                (totalStandard > 0 || (total4k > 0 && !this.enable4kShow)) &&
                media.jellyfinMediaId !== Id
              ) {
                media.jellyfinMediaId = Id;
              }

              if (
                media &&
                total4k > 0 &&
                this.enable4kShow &&
                media.jellyfinMediaId4k !== Id
              ) {
                media.jellyfinMediaId4k = Id;
              }

              if (existingSeason) {
                // These ternary statements look super confusing, but they are simply
                // setting the status to AVAILABLE if all of a type is there, partially if some,
                // and then not modifying the status if there are 0 items
                existingSeason.status =
                  totalStandard === season.episode_count
                    ? MediaStatus.AVAILABLE
                    : totalStandard > 0
                    ? MediaStatus.PARTIALLY_AVAILABLE
                    : existingSeason.status;
                existingSeason.status4k =
                  this.enable4kShow && total4k === season.episode_count
                    ? MediaStatus.AVAILABLE
                    : this.enable4kShow && total4k > 0
                    ? MediaStatus.PARTIALLY_AVAILABLE
                    : existingSeason.status4k;
              } else {
                newSeasons.push(
                  new Season({
                    seasonNumber: season.season_number,
                    // This ternary is the same as the ones above, but it just falls back to "UNKNOWN"
                    // if we dont have any items for the season
                    status:
                      totalStandard === season.episode_count
                        ? MediaStatus.AVAILABLE
                        : totalStandard > 0
                        ? MediaStatus.PARTIALLY_AVAILABLE
                        : MediaStatus.UNKNOWN,
                    status4k:
                      this.enable4kShow && total4k === season.episode_count
                        ? MediaStatus.AVAILABLE
                        : this.enable4kShow && total4k > 0
                        ? MediaStatus.PARTIALLY_AVAILABLE
                        : MediaStatus.UNKNOWN,
                  })
                );
              }
            }
          }

          // Remove extras season. We dont count it for determining availability
          const filteredSeasons = tvShow.seasons.filter(
            (season) => season.season_number !== 0
          );

          const isAllStandardSeasons =
            newSeasons.filter(
              (season) => season.status === MediaStatus.AVAILABLE
            ).length +
              (media?.seasons.filter(
                (season) => season.status === MediaStatus.AVAILABLE
              ).length ?? 0) >=
            filteredSeasons.length;

          const isAll4kSeasons =
            newSeasons.filter(
              (season) => season.status4k === MediaStatus.AVAILABLE
            ).length +
              (media?.seasons.filter(
                (season) => season.status4k === MediaStatus.AVAILABLE
              ).length ?? 0) >=
            filteredSeasons.length;

          if (media) {
            // Update existing
            media.seasons = [...media.seasons, ...newSeasons];

            const newStandardSeasonAvailable = (
              media.seasons.filter(
                (season) => season.status === MediaStatus.AVAILABLE
              ) ?? []
            ).length;

            const new4kSeasonAvailable = (
              media.seasons.filter(
                (season) => season.status4k === MediaStatus.AVAILABLE
              ) ?? []
            ).length;

            // If at least one new season has become available, update
            // the lastSeasonChange field so we can trigger notifications
            if (newStandardSeasonAvailable > currentStandardSeasonAvailable) {
              this.log(
                `Detected ${
                  newStandardSeasonAvailable - currentStandardSeasonAvailable
                } new standard season(s) for ${tvShow.name}`,
                'debug'
              );
              media.lastSeasonChange = new Date();
              media.mediaAddedAt = new Date(metadata.DateCreated ?? '');
            }

            if (new4kSeasonAvailable > current4kSeasonAvailable) {
              this.log(
                `Detected ${
                  new4kSeasonAvailable - current4kSeasonAvailable
                } new 4K season(s) for ${tvShow.name}`,
                'debug'
              );
              media.lastSeasonChange = new Date();
            }

            if (!media.mediaAddedAt) {
              media.mediaAddedAt = new Date(metadata.DateCreated ?? '');
            }

            // If the show is already available, and there are no new seasons, dont adjust
            // the status
            const shouldStayAvailable =
              media.status === MediaStatus.AVAILABLE &&
              newSeasons.filter(
                (season) => season.status !== MediaStatus.UNKNOWN
              ).length === 0;
            const shouldStayAvailable4k =
              media.status4k === MediaStatus.AVAILABLE &&
              newSeasons.filter(
                (season) => season.status4k !== MediaStatus.UNKNOWN
              ).length === 0;

            media.status =
              isAllStandardSeasons || shouldStayAvailable
                ? MediaStatus.AVAILABLE
                : media.seasons.some(
                    (season) => season.status !== MediaStatus.UNKNOWN
                  )
                ? MediaStatus.PARTIALLY_AVAILABLE
                : MediaStatus.UNKNOWN;
            media.status4k =
              (isAll4kSeasons || shouldStayAvailable4k) && this.enable4kShow
                ? MediaStatus.AVAILABLE
                : this.enable4kShow &&
                  media.seasons.some(
                    (season) => season.status4k !== MediaStatus.UNKNOWN
                  )
                ? MediaStatus.PARTIALLY_AVAILABLE
                : MediaStatus.UNKNOWN;
            await mediaRepository.save(media);
            this.log(`Updating existing title: ${tvShow.name}`);
          } else {
            const newMedia = new Media({
              mediaType: MediaType.TV,
              seasons: newSeasons,
              tmdbId: tvShow.id,
              tvdbId: tvShow.external_ids.tvdb_id,
              mediaAddedAt: new Date(metadata.DateCreated ?? ''),
              jellyfinMediaId: Id,
              jellyfinMediaId4k: Id,
              status: isAllStandardSeasons
                ? MediaStatus.AVAILABLE
                : newSeasons.some(
                    (season) => season.status !== MediaStatus.UNKNOWN
                  )
                ? MediaStatus.PARTIALLY_AVAILABLE
                : MediaStatus.UNKNOWN,
              status4k:
                isAll4kSeasons && this.enable4kShow
                  ? MediaStatus.AVAILABLE
                  : this.enable4kShow &&
                    newSeasons.some(
                      (season) => season.status4k !== MediaStatus.UNKNOWN
                    )
                  ? MediaStatus.PARTIALLY_AVAILABLE
                  : MediaStatus.UNKNOWN,
            });
            await mediaRepository.save(newMedia);
            this.log(`Saved ${tvShow.name}`);
          }
        });
      } else {
        this.log(`failed show: ${metadata.Name}`);
      }
    } catch (e) {
      this.log(
        `Failed to process Jellyfin item. Id: ${
          jellyfinitem.SeriesId ?? jellyfinitem.SeasonId ?? jellyfinitem.Id
        }`,
        'error',
        {
          errorMessage: e.message,
          jellyfinitem,
        }
      );
    }
  }

  private async processItems(slicedItems: JellyfinLibraryItem[]) {
    await Promise.all(
      slicedItems.map(async (item) => {
        if (item.Type === 'Movie') {
          await this.processMovie(item);
        } else if (item.Type === 'Series') {
          await this.processShow(item);
        }
      })
    );
  }

  private async loop({
    start = 0,
    end = BUNDLE_SIZE,
    sessionId,
  }: {
    start?: number;
    end?: number;
    sessionId?: string;
  } = {}) {
    const slicedItems = this.items.slice(start, end);

    if (!this.running) {
      throw new Error('Sync was aborted.');
    }

    if (this.sessionId !== sessionId) {
      throw new Error('New session was started. Old session aborted.');
    }

    if (start < this.items.length) {
      this.progress = start;
      await this.processItems(slicedItems);

      await new Promise<void>((resolve, reject) =>
        setTimeout(() => {
          this.loop({
            start: start + BUNDLE_SIZE,
            end: end + BUNDLE_SIZE,
            sessionId,
          })
            .then(() => resolve())
            .catch((e) => reject(new Error(e.message)));
        }, UPDATE_RATE)
      );
    }
  }

  private log(
    message: string,
    level: 'info' | 'error' | 'debug' | 'warn' = 'debug',
    optional?: Record<string, unknown>
  ): void {
    logger[level](message, { label: 'Jellyfin Sync', ...optional });
  }

  public async run(): Promise<void> {
    const settings = getSettings();

    if (settings.main.mediaServerType != MediaServerType.JELLYFIN) {
      return;
    }

    const sessionId = uuid();
    this.sessionId = sessionId;
    logger.info('Jellyfin Sync Starting', {
      sessionId,
      label: 'Jellyfin Sync',
    });
    try {
      this.running = true;
      const userRepository = getRepository(User);
      const admin = await userRepository.findOne({
        select: [
          'id',
          'jellyfinAuthToken',
          'jellyfinUserId',
          'jellyfinDeviceId',
        ],
        order: { id: 'ASC' },
      });

      if (!admin) {
        return this.log('No admin configured. Jellyfin sync skipped.', 'warn');
      }

      this.jfClient = new JellyfinAPI(
        settings.jellyfin.hostname ?? '',
        admin.jellyfinAuthToken,
        admin.jellyfinDeviceId
      );

      this.jfClient.setUserId(admin.jellyfinUserId ?? '');

      this.libraries = settings.jellyfin.libraries.filter(
        (library) => library.enabled
      );

      this.enable4kMovie = settings.radarr.some((radarr) => radarr.is4k);
      if (this.enable4kMovie) {
        this.log(
          'At least one 4K Radarr server was detected. 4K movie detection is now enabled',
          'info'
        );
      }

      this.enable4kShow = settings.sonarr.some((sonarr) => sonarr.is4k);
      if (this.enable4kShow) {
        this.log(
          'At least one 4K Sonarr server was detected. 4K series detection is now enabled',
          'info'
        );
      }

      if (this.isRecentOnly) {
        for (const library of this.libraries) {
          this.currentLibrary = library;
          this.log(
            `Beginning to process recently added for library: ${library.name}`,
            'info'
          );
          const libraryItems = await this.jfClient.getRecentlyAdded(library.id);

          // Bundle items up by rating keys
          this.items = uniqWith(libraryItems, (mediaA, mediaB) => {
            if (mediaA.SeriesId && mediaB.SeriesId) {
              return mediaA.SeriesId === mediaB.SeriesId;
            }

            if (mediaA.SeasonId && mediaB.SeasonId) {
              return mediaA.SeasonId === mediaB.SeasonId;
            }

            return mediaA.Id === mediaB.Id;
          });

          await this.loop({ sessionId });
        }
      } else {
        for (const library of this.libraries) {
          this.currentLibrary = library;
          this.log(`Beginning to process library: ${library.name}`, 'info');
          this.items = await this.jfClient.getLibraryContents(library.id);
          await this.loop({ sessionId });
        }
      }
      this.log(
        this.isRecentOnly
          ? 'Recently Added Scan Complete'
          : 'Full Scan Complete',
        'info'
      );
    } catch (e) {
      logger.error('Sync interrupted', {
        label: 'Jellyfin Sync',
        errorMessage: e.message,
      });
    } finally {
      // If a new scanning session hasnt started, set running back to false
      if (this.sessionId === sessionId) {
        this.running = false;
      }
    }
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
      currentLibrary: this.currentLibrary,
      libraries: this.libraries,
    };
  }

  public cancel(): void {
    this.running = false;
  }
}

export const jobJellyfinFullSync = new JobJellyfinSync();
export const jobJellyfinRecentSync = new JobJellyfinSync({
  isRecentOnly: true,
});
