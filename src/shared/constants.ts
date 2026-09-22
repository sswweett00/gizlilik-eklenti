export const TRACKING_QUERY_PARAMS = Object.freeze([
  'utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id',
  'gclid','dclid','fbclid','mc_cid','mc_eid','msclkid','yclid','_hsenc',
  'igshid','vero_id','oly_enc_id','oly_anon_id','ref','ref_',
]);

export const IP_DISCOVERY_DOMAINS = Object.freeze([
  'api.ipify.org','api64.ipify.org','ipify.org','ifconfig.co','ifconfig.me',
  'icanhazip.com','ident.me','ip.sb','myip.com','checkip.amazonaws.com',
  'checkip.dyndns.org','whatismyip.akamai.com','ipv4.icanhazip.com',
  'ipv6.icanhazip.com','api.my-ip.io','seeip.org','ip.seeip.org',
]);

export const GEOLOCATION_API_DOMAINS = Object.freeze([
  'ipapi.co','ipinfo.io','ipwho.is','ip-api.com','ipgeolocation.io',
  'ipdata.co','freeipapi.com','geolocation-db.com','ipapi.com','ip2location.io',
]);

export const DEFAULT_SECURITY_MODE = 'maximum_direct' as const;
export const DEFAULT_LOCALE = 'en-US';
export const DEFAULT_LANGUAGES = Object.freeze(['en-US', 'en']);
