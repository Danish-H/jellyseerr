import { DownloadIcon } from '@heroicons/react/outline';
import { BellIcon, CheckIcon, ClockIcon } from '@heroicons/react/solid';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { MediaStatus } from '../../../server/constants/media';
import type { MediaType } from '../../../server/models/Search';
import Spinner from '../../assets/spinner.svg';
import { useIsTouch } from '../../hooks/useIsTouch';
import { Permission, useUser } from '../../hooks/useUser';
import globalMessages from '../../i18n/globalMessages';
import { withProperties } from '../../utils/typeHelpers';
import Button from '../Common/Button';
import CachedImage from '../Common/CachedImage';
import RequestModal from '../RequestModal';
import Transition from '../Transition';
import Placeholder from './Placeholder';

interface TitleCardProps {
  id: number;
  image?: string;
  summary?: string;
  year?: string;
  title: string;
  userScore: number;
  mediaType: MediaType;
  status?: MediaStatus;
  canExpand?: boolean;
  inProgress?: boolean;
}

const TitleCard: React.FC<TitleCardProps> = ({
  id,
  image,
  summary,
  year,
  title,
  status,
  mediaType,
  inProgress = false,
  canExpand = false,
}) => {
  const isTouch = useIsTouch();
  const intl = useIntl();
  const { hasPermission } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [showDetail, setShowDetail] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);

  // Just to get the year from the date
  if (year) {
    year = year.slice(0, 4);
  }

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  const requestComplete = useCallback((newStatus: MediaStatus) => {
    setCurrentStatus(newStatus);
    setShowRequestModal(false);
  }, []);

  const requestUpdating = useCallback(
    (status: boolean) => setIsUpdating(status),
    []
  );

  const closeModal = useCallback(() => setShowRequestModal(false), []);

  const showRequestButton = hasPermission(
    [
      Permission.REQUEST,
      mediaType === 'movie' ? Permission.REQUEST_MOVIE : Permission.REQUEST_TV,
    ],
    { type: 'or' }
  );

  return (
    <div className={canExpand ? 'w-full' : 'w-36 sm:w-36 md:w-44'}>
      <RequestModal
        tmdbId={id}
        show={showRequestModal}
        type={mediaType === 'movie' ? 'movie' : 'tv'}
        onComplete={requestComplete}
        onUpdating={requestUpdating}
        onCancel={closeModal}
      />
      <div
        className={`transition duration-300 transform-gpu outline-none cursor-default relative bg-gray-800 bg-cover rounded-xl ring-1 overflow-hidden ${
          showDetail
            ? 'scale-105 shadow-lg ring-gray-500'
            : 'scale-100 shadow ring-gray-700'
        }`}
        style={{
          paddingBottom: '150%',
        }}
        onMouseEnter={() => {
          if (!isTouch) {
            setShowDetail(true);
          }
        }}
        onMouseLeave={() => setShowDetail(false)}
        onClick={() => setShowDetail(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setShowDetail(true);
          }
        }}
        role="link"
        tabIndex={0}
      >
        <div className="absolute inset-0 w-full h-full overflow-hidden">
          <CachedImage
            className="absolute inset-0 w-full h-full"
            alt=""
            src={
              image
                ? `https://image.tmdb.org/t/p/w300_and_h450_face${image}`
                : `/images/overseerr_poster_not_found_logo_top.png`
            }
            layout="fill"
            objectFit="cover"
          />
          <div className="absolute left-0 right-0 flex items-center justify-between p-2">
            <div
              className={`rounded-full z-40 pointer-events-none shadow ${
                mediaType === 'movie' ? 'bg-blue-500' : 'bg-purple-600'
              }`}
            >
              <div className="flex items-center h-4 px-2 py-2 text-xs font-normal tracking-wider text-center text-white uppercase sm:h-5">
                {mediaType === 'movie'
                  ? intl.formatMessage(globalMessages.movie)
                  : intl.formatMessage(globalMessages.tvshow)}
              </div>
            </div>
            <div className="z-40 pointer-events-none">
              {(currentStatus === MediaStatus.AVAILABLE ||
                currentStatus === MediaStatus.PARTIALLY_AVAILABLE) && (
                <div className="flex items-center justify-center w-4 h-4 text-white bg-green-400 rounded-full shadow sm:w-5 sm:h-5">
                  <CheckIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              )}
              {currentStatus === MediaStatus.PENDING && (
                <div className="flex items-center justify-center w-4 h-4 text-white bg-yellow-500 rounded-full shadow sm:w-5 sm:h-5">
                  <BellIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                </div>
              )}
              {currentStatus === MediaStatus.PROCESSING && (
                <div className="flex items-center justify-center w-4 h-4 text-white bg-indigo-500 rounded-full shadow sm:w-5 sm:h-5">
                  {inProgress ? (
                    <Spinner className="w-3 h-3" />
                  ) : (
                    <ClockIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                  )}
                </div>
              )}
            </div>
          </div>
          <Transition
            show={isUpdating}
            enter="transition ease-in-out duration-300 transform opacity-0"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition ease-in-out duration-300 transform opacity-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="absolute inset-0 z-40 flex items-center justify-center text-white bg-gray-800 bg-opacity-75 rounded-xl">
              <Spinner className="w-10 h-10" />
            </div>
          </Transition>

          <Transition
            show={!image || showDetail || showRequestModal}
            enter="transition transform opacity-0"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="transition transform opacity-100"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="absolute inset-0 overflow-hidden rounded-xl">
              <Link href={mediaType === 'movie' ? `/movie/${id}` : `/tv/${id}`}>
                <a
                  className="absolute inset-0 w-full h-full overflow-hidden text-left cursor-pointer"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(45, 55, 72, 0.4) 0%, rgba(45, 55, 72, 0.9) 100%)',
                  }}
                >
                  <div className="flex items-end w-full h-full">
                    <div
                      className={`px-2 text-white ${
                        !showRequestButton ||
                        (currentStatus && currentStatus !== MediaStatus.UNKNOWN)
                          ? 'pb-2'
                          : 'pb-11'
                      }`}
                    >
                      {year && <div className="text-sm">{year}</div>}

                      <h1
                        className="text-xl leading-tight whitespace-normal"
                        style={{
                          WebkitLineClamp: 3,
                          display: '-webkit-box',
                          overflow: 'hidden',
                          WebkitBoxOrient: 'vertical',
                          wordBreak: 'break-word',
                        }}
                      >
                        {title}
                      </h1>
                      <div
                        className="text-xs whitespace-normal"
                        style={{
                          WebkitLineClamp:
                            !showRequestButton ||
                            (currentStatus &&
                              currentStatus !== MediaStatus.UNKNOWN)
                              ? 5
                              : 3,
                          display: '-webkit-box',
                          overflow: 'hidden',
                          WebkitBoxOrient: 'vertical',
                          wordBreak: 'break-word',
                        }}
                      >
                        {summary}
                      </div>
                    </div>
                  </div>
                </a>
              </Link>

              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 py-2">
                {showRequestButton &&
                  (!currentStatus || currentStatus === MediaStatus.UNKNOWN) && (
                    <Button
                      buttonType="primary"
                      buttonSize="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowRequestModal(true);
                      }}
                      className="w-full h-7"
                    >
                      <DownloadIcon />
                      <span>{intl.formatMessage(globalMessages.request)}</span>
                    </Button>
                  )}
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
  );
};

export default withProperties(TitleCard, { Placeholder });
