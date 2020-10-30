import React from 'react';
import useSWR from 'swr';
import LoadingSpinner from '../Common/LoadingSpinner';
import type { MainSettings } from '../../../server/lib/settings';
import CopyButton from './CopyButton';

const SettingsMain: React.FC = () => {
  const { data, error } = useSWR<MainSettings>('/api/v1/settings/main');

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <div>
        <h3 className="text-lg leading-6 font-medium text-cool-gray-200">
          General Settings
        </h3>
        <p className="mt-1 max-w-2xl text-sm leading-5 text-cool-gray-500">
          These are settings related to general Overseerr configuration.
        </p>
      </div>
      <div className="mt-6 sm:mt-5">
        <div className="sm:grid sm:grid-cols-3 sm:gap-4 sm:items-start sm:border-t sm:border-gray-800 sm:pt-5">
          <label
            htmlFor="username"
            className="block text-sm font-medium leading-5 text-cool-gray-400 sm:mt-px sm:pt-2"
          >
            API Key
          </label>
          <div className="mt-1 sm:mt-0 sm:col-span-2">
            <div className="max-w-lg flex rounded-md shadow-sm">
              <input
                id="username"
                className="flex-1 form-input block w-full min-w-0 rounded-none rounded-l-md transition duration-150 ease-in-out sm:text-sm sm:leading-5 bg-cool-gray-700 border border-cool-gray-500"
                value={data?.apiKey}
                readOnly
              />
              <CopyButton textToCopy={data?.apiKey ?? ''} />
              <button className="-ml-px relative inline-flex items-center px-4 py-2 border border-cool-gray-500 text-sm leading-5 font-medium rounded-r-md text-white bg-indigo-500  hover:bg-indigo-400 focus:outline-none focus:shadow-outline-blue focus:border-blue-300 active:bg-gray-100 active:text-gray-700 transition ease-in-out duration-150">
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    fillRule="evenodd"
                    d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SettingsMain;
