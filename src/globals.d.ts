declare var chrome: any;

interface Window {
  __FBIS_PAYLOAD_BRIDGE__?: boolean;
  FBISConstants?: any;
  FBISI18n?: any;
  FBISLogger?: any;
  FBISNaming?: any;
  FBISUI?: any;
  FacebookAlbumCollector?: any;
}

declare namespace NodeJS {
  interface Global {
    window?: any;
    document?: any;
  }
}
