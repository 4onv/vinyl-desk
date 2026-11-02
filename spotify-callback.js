import {SpotifyAuth} from './spotify-auth.js';
const callback=location.href;
// Remove the authorization code from browser history before any other navigation.
history.replaceState(null,'',location.pathname);
try {await new SpotifyAuth().complete(callback);location.replace(new URL('./',location.href).href);}
catch(error) {document.querySelector('h1').textContent='Let’s try that again.';document.getElementById('status').textContent=error.message;}
