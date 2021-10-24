import { EyeIcon } from '@heroicons/react/solid';
import Link from 'next/link';
import React from 'react';
import { useInView } from 'react-intersection-observer';
import { defineMessages, FormattedRelativeTime, useIntl } from 'react-intl';
import useSWR from 'swr';
import { IssueStatus } from '../../../../server/constants/issue';
import { MediaType } from '../../../../server/constants/media';
import Issue from '../../../../server/entity/Issue';
import { MovieDetails } from '../../../../server/models/Movie';
import { TvDetails } from '../../../../server/models/Tv';
import { Permission, useUser } from '../../../hooks/useUser';
import globalMessages from '../../../i18n/globalMessages';
import Badge from '../../Common/Badge';
import Button from '../../Common/Button';
import CachedImage from '../../Common/CachedImage';
import { issueOptions } from '../../IssueModal/constants';

const messages = defineMessages({
  openeduserdate: '{date} by {user}',
  allseasons: 'All Seasons',
  season: 'Season {seasonNumber}',
  problemepisode: 'Affected Episode',
  allepisodes: 'All Episodes',
  episode: 'Episode {episodeNumber}',
  issuetype: 'Type',
  issuestatus: 'Status',
  opened: 'Opened',
  viewissue: 'View Issue',
  unknownissuetype: 'Unknown',
});

const isMovie = (movie: MovieDetails | TvDetails): movie is MovieDetails => {
  return (movie as MovieDetails).title !== undefined;
};

interface IssueItemProps {
  issue: Issue;
}

const IssueItem: React.FC<IssueItemProps> = ({ issue }) => {
  const intl = useIntl();
  const { hasPermission } = useUser();
  const { ref, inView } = useInView({
    triggerOnce: true,
  });
  const url =
    issue.media.mediaType === 'movie'
      ? `/api/v1/movie/${issue.media.tmdbId}`
      : `/api/v1/tv/${issue.media.tmdbId}`;
  const { data: title, error } = useSWR<MovieDetails | TvDetails>(
    inView ? url : null
  );

  if (!title && !error) {
    return (
      <div
        className="w-full bg-gray-800 h-52 sm:h-40 xl:h-24 rounded-xl animate-pulse"
        ref={ref}
      />
    );
  }

  if (!title) {
    return <div>uh oh</div>;
  }

  const issueOption = issueOptions.find(
    (opt) => opt.issueType === issue?.issueType
  );

  const problemSeasonEpisodeLine = [];

  if (!isMovie(title) && issue) {
    problemSeasonEpisodeLine.push(
      issue.problemSeason > 0
        ? intl.formatMessage(messages.season, {
            seasonNumber: issue.problemSeason,
          })
        : intl.formatMessage(messages.allseasons)
    );

    if (issue.problemSeason > 0) {
      problemSeasonEpisodeLine.push(
        issue.problemEpisode > 0
          ? intl.formatMessage(messages.episode, {
              episodeNumber: issue.problemEpisode,
            })
          : intl.formatMessage(messages.allepisodes)
      );
    }
  }

  return (
    <div className="relative flex flex-col justify-between w-full py-2 overflow-hidden text-gray-400 bg-gray-800 shadow-md h-52 sm:h-40 xl:h-24 ring-1 ring-gray-700 rounded-xl xl:flex-row">
      {title.backdropPath && (
        <div className="absolute inset-0 z-0 w-full bg-center bg-cover xl:w-2/3">
          <CachedImage
            src={`https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${title.backdropPath}`}
            alt=""
            layout="fill"
            objectFit="cover"
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(90deg, rgba(31, 41, 55, 0.47) 0%, rgba(31, 41, 55, 1) 100%)',
            }}
          />
        </div>
      )}
      <div className="relative flex flex-col justify-between w-full overflow-hidden sm:flex-row">
        <div className="relative z-10 flex items-center w-full pl-4 pr-4 overflow-hidden xl:w-7/12 2xl:w-2/3 sm:pr-0">
          <Link
            href={
              issue.media.mediaType === MediaType.MOVIE
                ? `/movie/${issue.media.tmdbId}`
                : `/tv/${issue.media.tmdbId}`
            }
          >
            <a className="relative flex-shrink-0 w-10 h-auto overflow-hidden transition duration-300 scale-100 rounded-md transform-gpu hover:scale-105">
              <CachedImage
                src={
                  title.posterPath
                    ? `https://image.tmdb.org/t/p/w600_and_h900_bestv2${title.posterPath}`
                    : '/images/overseerr_poster_not_found.png'
                }
                alt=""
                layout="responsive"
                width={600}
                height={900}
                objectFit="cover"
              />
            </a>
          </Link>
          <div className="flex flex-col justify-center pl-2 overflow-hidden xl:pl-4">
            <div className="pt-0.5 sm:pt-1 text-xs text-white">
              {(isMovie(title) ? title.releaseDate : title.firstAirDate)?.slice(
                0,
                4
              )}
            </div>
            <Link
              href={
                issue.media.mediaType === MediaType.MOVIE
                  ? `/movie/${issue.media.tmdbId}`
                  : `/tv/${issue.media.tmdbId}`
              }
            >
              <a className="min-w-0 mr-2 text-lg font-bold text-white truncate xl:text-xl hover:underline">
                {isMovie(title) ? title.title : title.name}
              </a>
            </Link>
            {problemSeasonEpisodeLine.length > 0 && (
              <div className="text-sm text-gray-200">
                {problemSeasonEpisodeLine.join(' | ')}
              </div>
            )}
          </div>
        </div>
        <div className="z-10 flex flex-col justify-center w-full pr-4 mt-4 ml-4 overflow-hidden text-sm sm:ml-2 sm:mt-0 xl:flex-1 xl:pr-0">
          <div className="card-field">
            <span className="card-field-name">
              {intl.formatMessage(messages.issuestatus)}
            </span>
            {issue.status === IssueStatus.OPEN ? (
              <Badge badgeType="primary">
                {intl.formatMessage(globalMessages.open)}
              </Badge>
            ) : (
              <Badge badgeType="success">
                {intl.formatMessage(globalMessages.resolved)}
              </Badge>
            )}
          </div>
          <div className="card-field">
            <span className="card-field-name">
              {intl.formatMessage(messages.issuetype)}
            </span>
            <span className="flex text-sm text-gray-300 truncate">
              {intl.formatMessage(
                issueOption?.name ?? messages.unknownissuetype
              )}
            </span>
          </div>
          <div className="card-field">
            {hasPermission([Permission.MANAGE_ISSUES, Permission.VIEW_ISSUES], {
              type: 'or',
            }) ? (
              <>
                <span className="card-field-name">
                  {intl.formatMessage(messages.opened)}
                </span>
                <span className="flex text-sm text-gray-300 truncate">
                  {intl.formatMessage(messages.openeduserdate, {
                    date: (
                      <FormattedRelativeTime
                        value={Math.floor(
                          (new Date(issue.createdAt).getTime() - Date.now()) /
                            1000
                        )}
                        updateIntervalInSeconds={1}
                        numeric="auto"
                      />
                    ),
                    user: (
                      <Link href={`/users/${issue.createdBy.id}`}>
                        <a className="flex items-center truncate group">
                          <img
                            src={issue.createdBy.avatar}
                            alt=""
                            className="ml-1.5 avatar-sm"
                          />
                          <span className="text-sm truncate group-hover:underline">
                            {issue.createdBy.displayName}
                          </span>
                        </a>
                      </Link>
                    ),
                  })}
                </span>
              </>
            ) : (
              <>
                <span className="card-field-name">
                  {intl.formatMessage(messages.opened)}
                </span>
                <span className="flex text-sm text-gray-300 truncate">
                  <FormattedRelativeTime
                    value={Math.floor(
                      (new Date(issue.createdAt).getTime() - Date.now()) / 1000
                    )}
                    updateIntervalInSeconds={1}
                    numeric="auto"
                  />
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="z-10 flex flex-col justify-center w-full pl-4 pr-4 mt-4 xl:mt-0 xl:items-end xl:w-96 xl:pl-0">
        <span className="w-full">
          <Link href={`/issues/${issue.id}`} passHref>
            <Button as="a" className="w-full" buttonType="primary">
              <EyeIcon />
              <span>{intl.formatMessage(messages.viewissue)}</span>
            </Button>
          </Link>
        </span>
      </div>
    </div>
  );
};

export default IssueItem;
