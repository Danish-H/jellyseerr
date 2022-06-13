import { InboxInIcon } from '@heroicons/react/solid';
import axios from 'axios';
import React, { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR from 'swr';
import useSettings from '../../hooks/useSettings';
import globalMessages from '../../i18n/globalMessages';
import Alert from '../Common/Alert';
import Modal from '../Common/Modal';
import getConfig from 'next/config';
import { UserResultsResponse } from '../../../server/interfaces/api/userInterfaces';

interface JellyfinImportProps {
  onCancel?: () => void;
  onComplete?: () => void;
}

const messages = defineMessages({
  importfromJellyfin: 'Import {mediaServerName} Users',
  importfromJellyfinerror:
    'Something went wrong while importing {mediaServerName} users.',
  importedfromJellyfin:
    '<strong>{userCount}</strong> {mediaServerName} {userCount, plural, one {user} other {users}} imported successfully!',
  user: 'User',
  noJellyfinuserstoimport: 'There are no {mediaServerName} users to import.',
  newJellyfinsigninenabled:
    'The <strong>Enable New {mediaServerName} Sign-In</strong> setting is currently enabled. {mediaServerName} users with library access do not need to be imported in order to sign in.',
});

const JellyfinImportModal: React.FC<JellyfinImportProps> = ({
  onCancel,
  onComplete,
  children,
}) => {
  const intl = useIntl();
  const settings = useSettings();
  const { publicRuntimeConfig } = getConfig();
  const { addToast } = useToasts();
  const [isImporting, setImporting] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const { data, error } = useSWR<
    {
      id: string;
      title: string;
      username: string;
      email: string;
      thumb: string;
    }[]
  >(`/api/v1/settings/jellyfin/users`, {
    revalidateOnMount: true,
  });

  const importUsers = async () => {
    setImporting(true);

    try {
      const { data: createdUsers } = await axios.post(
        '/api/v1/user/import-from-jellyfin',
        { jellyfinUserIds: selectedUsers }
      );

      if (!createdUsers.length) {
        throw new Error('No users were imported from Jellyfin.');
      }

      addToast(
        intl.formatMessage(messages.importedfromJellyfin, {
          userCount: createdUsers.length,
          strong: function strong(msg) {
            return <strong>{msg}</strong>;
          },
          mediaServerName:
            publicRuntimeConfig.JELLYFIN_TYPE == 'emby' ? 'Emby' : 'Jellyfin',
        }),
        {
          autoDismiss: true,
          appearance: 'success',
        }
      );

      if (onComplete) {
        onComplete();
      }
    } catch (e) {
      addToast(
        intl.formatMessage(messages.importfromJellyfinerror, {
          mediaServerName:
            publicRuntimeConfig.JELLYFIN_TYPE == 'emby' ? 'Emby' : 'Jellyfin',
        }),
        {
          autoDismiss: true,
          appearance: 'error',
        }
      );
    } finally {
      setImporting(false);
    }
  };

  const isSelectedUser = (JellyfinId: string): boolean =>
    selectedUsers.includes(JellyfinId);

  const isAllUsers = (): boolean => selectedUsers.length === data?.length;

  const toggleUser = (JellyfinId: string): void => {
    if (selectedUsers.includes(JellyfinId)) {
      setSelectedUsers((users) => users.filter((user) => user !== JellyfinId));
    } else {
      setSelectedUsers((users) => [...users, JellyfinId]);
    }
  };

  const toggleAllUsers = (): void => {
    if (data && selectedUsers.length >= 0 && !isAllUsers()) {
      setSelectedUsers(data.map((user) => user.id));
    } else {
      setSelectedUsers([]);
    }
  };

  const { data: existingUsers } = useSWR<UserResultsResponse>(
    `/api/v1/user?take=${children}`
  );

  data?.forEach((user, pos) => {
    if (
      existingUsers?.results.some(
        (existingUser) => existingUser.jellyfinUserId === user.id
      )
    ) {
      delete data[pos];
    }
  });

  return (
    <Modal
      loading={!data && !error}
      title={intl.formatMessage(messages.importfromJellyfin, {
        mediaServerName:
          publicRuntimeConfig.JELLYFIN_TYPE == 'emby' ? 'Emby' : 'Jellyfin',
      })}
      iconSvg={<InboxInIcon />}
      onOk={() => {
        importUsers();
      }}
      okDisabled={isImporting || !selectedUsers.length}
      okText={intl.formatMessage(
        isImporting ? globalMessages.importing : globalMessages.import
      )}
      onCancel={onCancel}
    >
      {data?.length ? (
        <>
          {settings.currentSettings.newPlexLogin && (
            <Alert
              title={intl.formatMessage(messages.newJellyfinsigninenabled, {
                mediaServerName:
                  publicRuntimeConfig.JELLYFIN_TYPE == 'emby'
                    ? 'Emby'
                    : 'Jellyfin',
                strong: function strong(msg) {
                  return (
                    <strong className="font-semibold text-white">{msg}</strong>
                  );
                },
              })}
              type="info"
            />
          )}
          <div className="flex flex-col">
            <div className="-mx-4 sm:mx-0">
              <div className="inline-block min-w-full py-2 align-middle">
                <div className="overflow-hidden shadow sm:rounded-lg">
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th className="w-16 bg-gray-500 px-4 py-3">
                          <span
                            role="checkbox"
                            tabIndex={0}
                            aria-checked={isAllUsers()}
                            onClick={() => toggleAllUsers()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === 'Space') {
                                toggleAllUsers();
                              }
                            }}
                            className="relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none"
                          >
                            <span
                              aria-hidden="true"
                              className={`${
                                isAllUsers() ? 'bg-indigo-500' : 'bg-gray-800'
                              } absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out`}
                            ></span>
                            <span
                              aria-hidden="true"
                              className={`${
                                isAllUsers() ? 'translate-x-5' : 'translate-x-0'
                              } absolute left-0 inline-block h-5 w-5 transform rounded-full border border-gray-200 bg-white shadow transition-transform duration-200 ease-in-out group-focus:border-blue-300 group-focus:ring`}
                            ></span>
                          </span>
                        </th>
                        <th className="bg-gray-500 px-1 py-3 text-left text-xs font-medium uppercase leading-4 tracking-wider text-gray-200 md:px-6">
                          {intl.formatMessage(messages.user)}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700 bg-gray-600">
                      {data?.map((user) => (
                        <tr key={`user-${user.id}`}>
                          <td className="whitespace-nowrap px-4 py-4 text-sm font-medium leading-5 text-gray-100">
                            <span
                              role="checkbox"
                              tabIndex={0}
                              aria-checked={isSelectedUser(user.id)}
                              onClick={() => toggleUser(user.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === 'Space') {
                                  toggleUser(user.id);
                                }
                              }}
                              className="relative inline-flex h-5 w-10 flex-shrink-0 cursor-pointer items-center justify-center pt-2 focus:outline-none"
                            >
                              <span
                                aria-hidden="true"
                                className={`${
                                  isSelectedUser(user.id)
                                    ? 'bg-indigo-500'
                                    : 'bg-gray-800'
                                } absolute mx-auto h-4 w-9 rounded-full transition-colors duration-200 ease-in-out`}
                              ></span>
                              <span
                                aria-hidden="true"
                                className={`${
                                  isSelectedUser(user.id)
                                    ? 'translate-x-5'
                                    : 'translate-x-0'
                                } absolute left-0 inline-block h-5 w-5 transform rounded-full border border-gray-200 bg-white shadow transition-transform duration-200 ease-in-out group-focus:border-blue-300 group-focus:ring`}
                              ></span>
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-1 py-4 text-sm font-medium leading-5 text-gray-100 md:px-6">
                            <div className="flex items-center">
                              <img
                                className="h-10 w-10 flex-shrink-0 rounded-full"
                                src={user.thumb}
                                alt=""
                              />
                              <div className="ml-4">
                                <div className="text-base font-bold leading-5">
                                  {user.username}
                                </div>
                                {/* {user.username &&
                                  user.username.toLowerCase() !==
                                  user.email && (
                                    <div className="text-sm leading-5 text-gray-300">
                                      {user.email}
                                    </div>
                                  )} */}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <Alert
          title={intl.formatMessage(messages.noJellyfinuserstoimport, {
            mediaServerName:
              publicRuntimeConfig.JELLYFIN_TYPE == 'emby' ? 'Emby' : 'Jellyfin',
          })}
          type="info"
        />
      )}
    </Modal>
  );
};

export default JellyfinImportModal;
