ObjC.import('Foundation');
const b = $.NSBundle.bundleWithPath('/System/Library/PrivateFrameworks/MediaRemote.framework/');
b.load;
const MRNowPlayingRequest = $.NSClassFromString('MRNowPlayingRequest');
let out = {};
if (MRNowPlayingRequest) {
  const item = MRNowPlayingRequest.localNowPlayingItem;
  const client = MRNowPlayingRequest.localNowPlayingPlayerPath;
  out.item = item ? ObjC.deepUnwrap(item.nowPlayingInfo) : null;
  out.client = client ? ObjC.unwrap(client.client.bundleIdentifier) : null;
  out.playing = ObjC.unwrap(MRNowPlayingRequest.localIsPlaying);
} else out.err = 'no MRNowPlayingRequest';
JSON.stringify(out);
