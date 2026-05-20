# Go Exchange Frontend

## Local development

The frontend expects the backend API at `http://localhost:8080` by default.

Vite automatically loads `.env.local` during local development. Keep `.env.local` uncommitted and use `.env.example` as the template.

Optional environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8080` | Backend HTTP API base URL. |
| `VITE_ENABLE_DEV_TOOLS` | `false` | Shows local-only wallet funding buttons. Use only with backend `GOEXCHANGE_ENABLE_DEV_TOOLS=true`. |

Run the app:

```powershell
npm run dev
```

Build and test:

```powershell
npm run build
npm test
```
