# Toono Scraper API

A clean, professional Vercel serverless scraper for **toono.app** — zero external dependencies, regex-based HTML parsing.

---

## Project Structure

```
toono-scraper/
├── config.ts           ← Base URL, headers, image sizes, route prefixes
├── lib/
│   ├── types.ts        ← All TypeScript interfaces
│   ├── utils.ts        ← fetchHtml, regex helpers, URL builders
│   └── scraper.ts      ← All HTML parsing logic
├── api/
│   ├── episode.ts      ← GET /api/episode
│   ├── series.ts       ← GET /api/series
│   └── search.ts       ← GET /api/search
├── vercel.json
├── tsconfig.json
└── package.json
```

---

## API Endpoints

### `GET /api/episode`
Scrape a full episode page (meta, player, all seasons/episodes, download links).

| Param  | Description                        |
|--------|------------------------------------|
| `slug` | e.g. `the-angel-next-door-spoils-me-rotten-1x1` |
| `url`  | Full URL (alternative to slug)     |

**Example:**
```
GET /api/episode?slug=the-angel-next-door-spoils-me-rotten-1x1
```

**Response:**
```json
{
  "success": true,
  "scrapedAt": "2025-01-01T00:00:00.000Z",
  "data": {
    "meta": {
      "title": "The Angel Next Door Spoils Me Rotten 1x1 — Hindi Watch/Download",
      "year": "2023",
      "duration": "24m",
      "rating": "7.7",
      "genres": ["Animation", "Comedy", "Hindi"],
      "description": "Amane Fujimiya...",
      "posterUrl": "https://image.tmdb.org/t/p/w342/...",
      "tags": ["The Angel Next Door Spoils Me Rotten"],
      "nextEpisodeUrl": "https://toono.app/episode/...",
      "trailerYouTubeId": "b5EJ9ZkK6kE"
    },
    "currentEpisode": {
      "season": 1,
      "episode": 1,
      "playerUrl": "https://toono.app/?trembed=1&trid=47709&trtype=2"
    },
    "seasons": [
      {
        "seasonNumber": 1,
        "episodeCount": 12,
        "airDate": "January 7, 2023",
        "episodes": [
          {
            "episodeId": "47709",
            "slug": "the-angel-next-door-spoils-me-rotten-1x1",
            "url": "https://toono.app/episode/...",
            "season": 1,
            "episode": 1,
            "title": "Meet the Angel",
            "thumbnail": "https://image.tmdb.org/t/p/w185/...",
            "language": "Hindi"
          }
        ]
      }
    ],
    "downloadLinks": [
      { "language": "Hindi", "encodedUrl": "aHR0cHM6..." }
    ]
  }
}
```

---

### `GET /api/series`
Scrape the series overview page.

| Param  | Description                          |
|--------|--------------------------------------|
| `slug` | e.g. `the-angel-next-door-spoils-me-rotten` |
| `url`  | Full series URL                       |

---

### `GET /api/search`
Search or browse a category.

| Param      | Description                      |
|------------|----------------------------------|
| `q`        | Search query                     |
| `category` | Category slug e.g. `hindi`       |
| `page`     | Page number (default: `1`)       |

**Examples:**
```
GET /api/search?q=angel+next+door
GET /api/search?category=hindi&page=2
```

---

## Deployment

```bash
# 1. Install deps
npm install

# 2. Local dev
npm run dev          # starts vercel dev on localhost:3000

# 3. Deploy
npx vercel --prod
```

---

## Decode Download URL

The `encodedUrl` field in download links is base64-encoded. Decode client-side:

```js
const realUrl = atob(encodedUrl);
```

---

## Extending

To add a new scraper (e.g. movies listing), create `api/movies.ts` and add a new parsing function in `lib/scraper.ts`. Update `vercel.json` routes if needed.
