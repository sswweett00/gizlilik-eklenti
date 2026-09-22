import { TRACKING_QUERY_PARAMS } from '../shared/constants';
export function buildUrlCleanerRule(): chrome.declarativeNetRequest.Rule {
  return {
    id:100, priority:100,
    action:{ type:'redirect', redirect:{ transform:{ queryTransform:{ removeParams:[...TRACKING_QUERY_PARAMS] } } } },
    condition:{
      regexFilter:'(?:[?&])(?:' + TRACKING_QUERY_PARAMS.join('|') + ')(?:=|&|$)',
      resourceTypes:['main_frame','sub_frame'],
    },
  };
}
