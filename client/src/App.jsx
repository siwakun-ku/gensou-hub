import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Container from './components/Container.jsx';
import RequireAdmin from './components/RequireAdmin.jsx';
import RequireAuth from './components/RequireAuth.jsx';
import Albums from './pages/Albums.jsx';
import Search from './pages/Search.jsx';
import AlbumDetail from './pages/AlbumDetail.jsx';
import AlbumNew from './pages/AlbumNew.jsx';
import AlbumEdit from './pages/AlbumEdit.jsx';
import Circles from './pages/Circles.jsx';
import CircleDetail from './pages/CircleDetail.jsx';
import CircleNew from './pages/CircleNew.jsx';
import CircleEdit from './pages/CircleEdit.jsx';
import Wallpapers from './pages/Wallpapers.jsx';
import Recommendations from './pages/Recommendations.jsx';
import Playlists from './pages/Playlists.jsx';
import Favourites from './pages/Favourites.jsx';
import PlaylistDetail from './pages/PlaylistDetail.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import NotFound from './pages/NotFound.jsx';
import { AuthProvider } from './lib/AuthContext.jsx';
import { PlayerProvider } from './lib/PlayerContext.jsx';
import { FavouritesProvider } from './lib/FavouritesContext.jsx';
import { HeroToneProvider } from './lib/HeroToneContext.jsx';
import { WallpaperProvider } from './lib/WallpaperContext.jsx';
import { ThemeProvider } from './lib/ThemeContext.jsx';

/**
 * Most pages sit inside the standard page width. Albums is the exception: it
 * renders a full-bleed hero first and wraps its own content, so it is routed
 * without a Container.
 */
const contained = (element) => <Container>{element}</Container>;

const adminOnly = (element) => contained(<RequireAdmin>{element}</RequireAdmin>);

const signedIn = (element) => contained(<RequireAuth>{element}</RequireAuth>);

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FavouritesProvider>
          <HeroToneProvider>
          {/* Above the routes, so the slideshow keeps its place across a
              navigation rather than restarting with each page that shows it. */}
          <WallpaperProvider>
          <PlayerProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route path="/" element={<Albums />} />
                <Route path="/search" element={contained(<Search />)} />
                <Route path="/login" element={contained(<Login />)} />
                <Route path="/register" element={contained(<Register />)} />
                <Route path="/albums/new" element={adminOnly(<AlbumNew />)} />
                <Route path="/albums/:id/edit" element={adminOnly(<AlbumEdit />)} />
                <Route path="/circles" element={contained(<Circles />)} />
                {/* The create page sits under /admin so a circle that happens
                    to be called "new" still gets its own page. */}
                <Route path="/admin/circles/new" element={adminOnly(<CircleNew />)} />
                <Route path="/circles/:name" element={contained(<CircleDetail />)} />
                <Route path="/circles/:name/edit" element={adminOnly(<CircleEdit />)} />
                <Route path="/admin/wallpapers" element={adminOnly(<Wallpapers />)} />
                <Route
                  path="/admin/recommendations"
                  element={adminOnly(<Recommendations />)}
                />
                <Route path="/favourites" element={signedIn(<Favourites />)} />
                <Route path="/playlists" element={signedIn(<Playlists />)} />
                <Route path="/playlists/:id" element={signedIn(<PlaylistDetail />)} />
                <Route path="/albums/:id" element={contained(<AlbumDetail />)} />
                <Route path="*" element={contained(<NotFound />)} />
              </Route>
            </Routes>
          </PlayerProvider>
          </WallpaperProvider>
          </HeroToneProvider>
        </FavouritesProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
