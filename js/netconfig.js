// ============================================================================
// Online play: the servers that help two players' browsers find each other.
//
// STUN servers tell each browser its public internet address, which is enough
// for most home networks to connect directly. When the two networks can't reach
// each other directly (mobile data, carrier-grade NAT, school / office / hotel
// networks, some routers), the game has to be relayed through a TURN server.
// The free relays PeerJS used to rely on no longer exist, so add one here:
//
//  - ExpressTURN (free plan, expressturn.com): sign up, then copy the server,
//    username and password from your dashboard into `turn` below, e.g.
//      turn: [{ urls: ['turn:free.expressturn.com:3478', 'turn:free.expressturn.com:3478?transport=tcp'], username: '...', credential: '...' }],
//  - Metered Open Relay (free 20 GB/month, metered.ca): sign up, create an app
//    and put its credentials URL (with your API key) in `meteredUrl`, e.g.
//      meteredUrl: 'https://yourapp.metered.live/api/v1/turn/credentials?apiKey=...',
//
// These credentials end up in the page anyone can open, which is normal for a
// browser game's relay; if your free quota is ever abused, make new ones.
// ============================================================================
const NET_CONFIG = {
  stun: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478', 'stun:global.stun.twilio.com:3478'],
  turn: [],
  meteredUrl: '',
  // testing only: send everything through the relay, as if the two networks couldn't connect directly
  forceRelay: false,
};
