# Gensou Hub

A web application for browsing, streaming and downloading music albums, with
accounts and an admin-only management role.

- **Frontend:** React 18 + Vite + Tailwind CSS v4 + React Router + axios (`client/`)
- **Backend:** Node.js + Express + Mongoose/MongoDB + Multer + JWT (`server/`)

## Features

- Album library with cover art, search (title / artist / track) and pagination
- Albums hold an ordered list of tracks with title, track number, artist, duration, format and size
- Cover art and audio files upload to the server and are served back through the API
- In-browser player with seeking (HTTP range requests), previous/next and volume,
  which keeps playing while you navigate
- Per-track download with a readable `Artist - Title.mp3` file name
- Admins can edit track information in place — title, track number, artist and length —
  and the album reorders itself when a track number changes
- Full-bleed, full-height home-page hero that slides through wallpapers an admin
  uploads, reorders and retires, with the header taking on the colour of the slide
  on screen and returning to its default tone once you scroll past it
- Recommended-tracks strip under the hero, which an admin sets to either a fixed
  hand-picked list or a fresh random draw from the library on every visit
- Registration and login with JWT, bcrypt-hashed passwords, and two roles
- API test suite over an in-memory MongoDB

## Accounts and roles

| Role      | Browse, play, download | Manage albums, tracks and wallpapers |
| --------- | ---------------------- | ------------------------------------ |
| anonymous | yes                    | no                                   |
| `user`    | yes                    | no                                   |
| `admin`   | yes                    | yes                                  |

The library is public to read: anyone can browse, stream and download without an
account. Every write is admin-only.

**Registration always creates a `user`.** The register endpoint ignores a `role`
sent in the request body, so nobody can promote themselves. Admins are made from
the server:

```bash
npm run create:admin --prefix server -- "Admin Name" admin@example.com "password123"
```

Run against an existing email, that command promotes the account instead.

## Prerequisites

- Node.js 20+ and npm
- MongoDB running locally (`mongodb://127.0.0.1:27017`) or a MongoDB Atlas URI

## Setup

```bash
npm install                 # root tooling (concurrently)
npm run install:all         # client + server dependencies

cp server/.env.example server/.env
cp client/.env.example client/.env
```

Edit `server/.env` and set `MONGO_URI` and `JWT_SECRET` (a long random string).

## Run

```bash
npm run dev
```

- Client: http://localhost:5173
- API: http://localhost:5000/api

Vite proxies `/api` to the Express server in development, so no CORS setup is needed
locally and the frontend never hardcodes the API host.

## Access from other devices on the same network

Both servers listen on every network interface, so anyone on the same Wi-Fi or LAN
can use the app. On start, each prints its network address:

```
  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.1.115:5173/
API listening on http://localhost:5000
            also on http://192.168.1.115:5000
```

Hand out the **Network** URL of the client (port 5173). Requests to `/api` are
proxied by the dev server on the host machine, so other devices need only that one
address and one open port.

Find the address again at any time with `ipconfig` (Windows) or `hostname -I` (Linux).

**Windows Firewall.** Windows blocks inbound connections on a network profile whose
firewall is on. Allow the two ports once, from an **Administrator** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Gensou Hub client" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "Gensou Hub API"    -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow -Profile Private
```

`-Profile Private` limits the opening to networks marked Private. If the network is
listed as Public (`Get-NetConnectionProfile`), either mark it Private with
`Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private` or add
`-Profile Public` to the rules above. Remove the rules with
`Remove-NetFirewallRule -DisplayName "Gensou Hub*"`.

**Which origins the API accepts.** `CLIENT_ORIGIN` is an explicit allow-list and takes
a comma-separated list. Beyond it, any loopback, `*.local` or private LAN address
(`10.x`, `192.168.x`, `172.16-31.x`, `169.254.x`) is accepted on any port, which is
what makes the LAN case work without listing every device. Set
`ALLOW_LAN_ORIGINS=false` to switch that off and honour only `CLIENT_ORIGIN`.

**Keeping it private again.** Set `HOST=127.0.0.1` in `server/.env` and remove
`host: true` from `client/vite.config.js` to go back to this machine only.

Note that anyone who can reach the app can browse, stream and download the whole
library — reads are public by design. Only writes need an admin account, so keep
this to networks you trust.

## Test

```bash
npm test --prefix server
```

Tests use Node's built-in runner with `supertest` and `mongodb-memory-server`, so
they need no running MongoDB — but the first run downloads a MongoDB binary and
needs network access. Uploads are redirected to a temp directory via `UPLOAD_DIR`.

## Deploy to Vercel

Both halves go to one Vercel project and share an origin, so the built client
calls `/api/...` with no API URL to configure, and the API accepts requests from
its own domain without being told what that domain is — preview URLs included.
`CLIENT_ORIGIN` only matters for a client served from somewhere else. `vercel.json` builds
the client to `client/dist`, serves it as a static site with an SPA fallback,
and rewrites `/api/*` to `api/index.js`, which runs the same Express app as a
serverless function.

**Uploads do not go to disk in a deployment.** A serverless function has a
read-only filesystem, so anything written to `server/uploads` would be gone by
the next request. Storage therefore has two drivers, chosen at runtime by
`server/src/config/storage.js`: local disk when you run the server yourself, and
[Vercel Blob](https://vercel.com/docs/vercel-blob) on Vercel. Nothing about
running locally changes.

1. **Push the repository to GitHub**, then import it at
   [vercel.com/new](https://vercel.com/new). Leave every build setting alone:
   `vercel.json` already specifies them.

2. **Create a Blob store with public access** under the project's Storage tab
   and connect it to the project. Access cannot be changed after creation, and
   covers, wallpapers and tracks are served straight from the store's URLs, so
   it has to be public. Connecting adds `BLOB_STORE_ID`, and the project then
   reaches the store with short-lived OIDC credentials Vercel supplies itself.
   Older connections use a `BLOB_READ_WRITE_TOKEN` instead; either works.

3. **Create a MongoDB Atlas cluster** and allow access from anywhere
   (`0.0.0.0/0`) — Vercel functions have no fixed IP to allow-list.

4. **Set the environment variables** under Settings → Environment Variables:

   | Variable | Value |
   | --- | --- |
   | `MONGO_URI` | the Atlas connection string, including the database name |
   | `JWT_SECRET` | a long random string — not the one from `.env.example` |
   | `JWT_EXPIRES_IN` | `7d` |
   | `ALLOW_LAN_ORIGINS` | `false` |
   | `NODE_ENV` | `production` |
   | `MAX_AUDIO_MB` | `50`, or lower — see the size note below |

   The Blob variables are added by step 2; do not set them by hand.

5. **Deploy**, then create the first admin. `npm run create:admin --prefix server`
   runs against whatever `MONGO_URI` points at, so run it locally with the Atlas
   string in `server/.env` and the account exists in the deployed database.

### What to expect from the free tier

**Uploads skip the API.** Vercel refuses any request to a function over 4.5 MB,
which most audio exceeds. So in a deployment the browser uploads each file
straight to the Blob store, using a signed upload URL from `POST /api/uploads`.
Only an admin can get one, it expires after 15 minutes, and the server picks
the file's name and signs that kind of upload's type and size limits into it.
The form that follows carries just the file's name in the store, and the server
asks the store for the file's real type and size before accepting it.
`MAX_AUDIO_MB` and the other limits apply as before. Locally, files are sent
inside the form as usual.

The Blob store must be created with **public** access: covers, wallpapers and
tracks are served straight from its URLs.

Downloading an album streams every track through the function to build the
zip, and a request may run for at most 60 seconds, so a very long album is the
slowest thing the API does and the likeliest to hit that limit.

## Project layout

```
client/
  src/
    components/   Layout, Container, HeroSlider, RecommendedTracks, AudioPlayer,
                  TrackList, TrackEditRow, AlbumCard, CoverArt, TrackUploadForm,
                  FormControls, RequireAdmin
    pages/        Albums (hero + recommended + grid), AlbumDetail, AlbumNew,
                  Wallpapers (admin), Recommendations (admin), Login, Register,
                  NotFound
    lib/
      api.js            axios instance, token handling, authApi + albumsApi +
                        wallpapersApi + recommendationsApi
      format.js         duration/size formatting, audio duration probing
      color.js          samples a wallpaper's colour and picks readable text
      AuthContext.jsx   session state, sign in/out, role checks
      HeroToneContext.jsx  carries the current slide's colour up to the header
      PlayerContext.jsx app-wide playback state
server/
  src/
    config/       db.js (Mongoose), storage.js (uploads: disk or Vercel Blob),
                  cors.js (origin policy)
    models/       Album.js (album + embedded tracks), User.js, Wallpaper.js,
                  RecommendationSetting.js, fileSchema.js (shared upload sub-schema)
    controllers/  albumController.js, authController.js, wallpaperController.js,
                  recommendationController.js
    routes/       albumRoutes.js, authRoutes.js, wallpaperRoutes.js,
                  recommendationRoutes.js, index.js
    middleware/   auth.js (protect / requireAdmin / optionalAuth), upload.js (Multer),
                  asyncHandler.js, errorHandler.js
    utils/        serialize.js (API shape), token.js (JWT sign/verify)
    scripts/      createAdmin.js
  tests/          albums.test.js, tracks.test.js, auth.test.js, wallpapers.test.js,
                  recommendations.test.js, cors.test.js, helpers.js
  uploads/        covers/, tracks/ and wallpapers/ (gitignored)
```

## Data model

`Album` — `title`, `artist`, `year`, `genre`, `description`, `cover` (file), `tracks[]`,
plus virtual `trackCount` and `totalDuration`. Tracks are embedded subdocuments and
are kept sorted by `trackNumber` on save.

`Track` — `title`, `trackNumber`, `artist` (falls back to the album artist),
`duration` (seconds), `audio` (file).

`User` — `name`, `email` (unique, lowercased), `password` (bcrypt, `select: false`
so it never comes back from a query by accident), `role` (`user` | `admin`).

`Wallpaper` — `image` (file), optional `title` / `subtitle` / `linkUrl` / `linkLabel`
shown over the slide, `order` (lower shows first) and `isActive` (retire a slide
without deleting its image).

`RecommendationSetting` — a single document (`key: 'default'`) holding `mode`
(`fixed` | `random`), `limit`, and `picks[]` (album id + track id, in display
order). Picks are kept when the mode is switched to random, so toggling does not
throw the selection away.

A stored file records `fileName` (on disk), `originalName`, `mimeType` and `size`.
On-disk names are never exposed; the API hands out URLs instead.

## API

Authenticated requests send `Authorization: Bearer <token>`.

| Method | Path                                       | Auth   | Description                             |
| ------ | ------------------------------------------ | ------ | --------------------------------------- |
| GET    | `/api/health`                              | —      | Health check                            |
| POST   | `/api/auth/register`                       | —      | Create a `user` account, returns a token |
| POST   | `/api/auth/login`                          | —      | Sign in, returns a token                |
| GET    | `/api/auth/me`                             | token  | The signed-in account                   |
| GET    | `/api/albums`                              | —      | List — `?q=&genre=&sort=&page=&limit=`  |
| POST   | `/api/albums`                              | admin  | Create (multipart, optional `cover`)    |
| GET    | `/api/albums/:id`                          | —      | One album with its tracks               |
| PUT    | `/api/albums/:id`                          | admin  | Update (multipart, optional `cover`)    |
| DELETE | `/api/albums/:id`                          | admin  | Delete album, tracks and files          |
| GET    | `/api/albums/:id/cover`                    | —      | Cover image                             |
| POST   | `/api/albums/:id/tracks`                   | admin  | Add track (multipart, required `audio`) |
| PUT    | `/api/albums/:id/tracks/:trackId`          | admin  | Update track metadata (JSON)            |
| DELETE | `/api/albums/:id/tracks/:trackId`          | admin  | Delete track and its file               |
| GET    | `/api/albums/:id/tracks/:trackId/stream`   | —      | Stream audio (supports `Range`)         |
| GET    | `/api/albums/:id/tracks/:trackId/download` | —      | Download audio as an attachment         |
| GET    | `/api/wallpapers`                          | —      | Hero slides in order (`?all=true` as admin includes retired ones) |
| POST   | `/api/wallpapers`                          | admin  | Upload a slide (multipart, required `image`) |
| GET    | `/api/wallpapers/:id`                      | —      | One slide                               |
| PUT    | `/api/wallpapers/:id`                      | admin  | Update caption/link/active, optionally replace `image` |
| PUT    | `/api/wallpapers/reorder`                  | admin  | Set display order from an `ids` array   |
| DELETE | `/api/wallpapers/:id`                      | admin  | Delete a slide and its image            |
| GET    | `/api/wallpapers/:id/image`                | —      | The slide image                         |
| GET    | `/api/recommendations`                     | —      | The resolved recommended tracks         |
| GET    | `/api/recommendations/settings`            | admin  | Mode, limit and picks                   |
| PUT    | `/api/recommendations/settings`            | admin  | Set mode / limit / picks                |

A request with no token on an admin route returns `401`; a signed-in non-admin
gets `403`.

Accepted uploads: audio `mp3, wav, flac, ogg, m4a/aac`, images `jpeg, png, webp, gif`.
Size caps come from `MAX_AUDIO_MB` (default 50), `MAX_COVER_MB` (default 5) and
`MAX_WALLPAPER_MB` (default 10).

## Notes

The header samples the current wallpaper by drawing it to a small canvas and
averaging the pixels, then deepens or lightens that average so the bar does not
read as muddy grey, and picks white or dark text from the result's luminance. If
the image is cross-origin the canvas is tainted and reading it fails — the header
simply keeps its default styling, so a deployment serving media from another host
loses the tint rather than breaking.

Most pages are routed inside a `Container` that sets the page width; the home page
is routed without one so its hero can run edge to edge, and wraps its own content
instead.

Uploaded files live on the server's local disk under `server/uploads/`. That is fine
for development and a single-server deployment; a multi-instance deployment would
want object storage (S3/GCS) or GridFS instead.

The JWT is kept in `localStorage` and sent as a bearer header. That is the simplest
thing that works with the dev proxy and is common for coursework; a production app
handling real accounts would be better served by an httpOnly, SameSite cookie, which
JavaScript cannot read and so survives an XSS bug intact.
