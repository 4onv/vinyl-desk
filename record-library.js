const idPattern=/^[A-Za-z0-9]{22}$/;
export function spotifyTrack(track) {
  if(!track || track.type==='episode' || !idPattern.test(track.id||'')) return null;
  const album=track.album||{};
  const albumId=idPattern.test(album.id||'')?album.id:/^spotify:album:([A-Za-z0-9]{22})$/.exec(album.uri||'')?.[1];
  const images=Array.isArray(album.images)?album.images:[];
  const cover=[...images].sort((a,b)=>Math.abs((a.width||300)-300)-Math.abs((b.width||300)-300)).find(image=>/^https:\/\//.test(image.url||''))?.url||'';
  return {source:'spotify',id:track.id,uri:'spotify:track:'+track.id,title:track.name||'Untitled track',
    artist:(track.artists||[]).map(artist=>artist.name).filter(Boolean).join(', '),album:album.name||track.name||'Single',
    albumId:albumId||track.id,albumUri:albumId?'spotify:album:'+albumId:'',
    cover,url:'https://open.spotify.com/track/'+track.id,albumUrl:'https://open.spotify.com/'+(albumId?'album/'+albumId:'track/'+track.id)};
}
export function spotifyAlbum(album) {
  if(!idPattern.test(album?.id||'')) return null;
  const record=spotifyTrack({id:album.id,name:album.name,artists:album.artists,album});
  return {...record,uri:'',url:record.albumUrl};
}
export function recentSpotifyAlbums(items,limit=12) {
  const seen=new Set(),albums=[];
  const sorted=[...(items||[])].sort((a,b)=>(Date.parse(b.played_at)||0)-(Date.parse(a.played_at)||0));
  for(const item of sorted) {
    const track=spotifyTrack(item.track);if(!track || seen.has(track.albumId)) continue;
    seen.add(track.albumId);albums.push({...track,playedAt:Date.parse(item.played_at)||0});
    if(albums.length>=limit) break;
  }
  return albums;
}
export class RecentRecords {
  constructor(limit=12) {this.limit=limit;this.items=[];}
  remember(track) {
    if(!track?.title) return false;
    const key=track.source+':'+(track.albumId||track.artist+'|'+(track.album||track.title));
    const entry={...track,key,album:track.album||track.title};
    const existing=this.items.find(item=>item.key===key);
    if(this.items[0]?.key===key && existing.title===entry.title && existing.cover===entry.cover) return false;
    const sameSource=this.items.filter(item=>item.key!==key&&item.source===track.source).slice(0,this.limit-1);
    this.items=[entry,...sameSource,...this.items.filter(item=>item.source!==track.source)];return true;
  }
  importSpotify(items) {for(const item of [...recentSpotifyAlbums(items,this.limit)].reverse()) this.remember(item);}
  removeSource(source) {this.items=this.items.filter(item=>item.source!==source);}
}
