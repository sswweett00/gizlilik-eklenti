import { TRACKING_QUERY_PARAMS } from '../shared/constants';

export function buildUrlCleanerRule(): chrome.declarativeNetRequest.Rule[] {
  return TRACKING_QUERY_PARAMS.map((param, index) => ({
    id: 100 + index,
    priority: 100,
    action: {
      type: 'redirect',
      redirect: {
        transform: {
          queryTransform: {
            removeParams: [...TRACKING_QUERY_PARAMS],
          },
        },
      },
    },
    condition: {
      regexFilter: '(?:[?&])' + param + '(?:=|&|$)',
      resourceTypes: ['main_frame', 'sub_frame'],
    },
  }));
}
