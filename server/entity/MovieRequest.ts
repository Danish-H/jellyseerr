import { MediaRequest } from './MediaRequest';
import { ChildEntity, AfterUpdate, AfterInsert } from 'typeorm';
import TheMovieDb from '../api/themoviedb';
import RadarrAPI from '../api/radarr';
import { getSettings } from '../lib/settings';
import { MediaType, MediaRequestStatus } from '../constants/media';

@ChildEntity(MediaType.MOVIE)
class MovieRequest extends MediaRequest {
  constructor(init?: Partial<MovieRequest>) {
    super(init);
  }

  @AfterUpdate()
  @AfterInsert()
  private async sendToRadarr() {
    if (this.status === MediaRequestStatus.APPROVED) {
      try {
        const settings = getSettings();
        if (settings.radarr.length === 0 && !settings.radarr[0]) {
          console.log(
            '[MediaRequest] Skipped radarr request as there is no radarr configured'
          );
          return;
        }

        const tmdb = new TheMovieDb();
        const radarrSettings = settings.radarr[0];
        const radarr = new RadarrAPI({
          apiKey: radarrSettings.apiKey,
          url: `${radarrSettings.useSsl ? 'https' : 'http'}://${
            radarrSettings.hostname
          }:${radarrSettings.port}/api`,
        });
        const movie = await tmdb.getMovie({ movieId: this.media.tmdbId });

        await radarr.addMovie({
          profileId: radarrSettings.activeProfileId,
          qualityProfileId: radarrSettings.activeProfileId,
          rootFolderPath: radarrSettings.activeDirectory,
          title: movie.title,
          tmdbId: movie.id,
          year: Number(movie.release_date.slice(0, 4)),
          monitored: true,
          searchNow: true,
        });
        console.log('[MediaRequest] Sent request to Radarr');
      } catch (e) {
        throw new Error(
          `[MediaRequest] Request failed to send to radarr: ${e.message}`
        );
      }
    }
  }
}

export default MovieRequest;
