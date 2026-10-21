This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Environment variables

Set on the Vercel project. None of them is a secret.

| Name | What it is | Without it |
| :--- | :--- | :--- |
| `FLASK_API_URL` | The Flask API, e.g. `https://api-staging.neighborhoodcandylady.com` | Nothing loads |
| `NEXT_PUBLIC_SITE_URL` | This site's own address, used for links, the sitemap and share cards | Search engines are told not to index it |
| `NEXT_PUBLIC_IMAGE_HOST` | Host of the API's `STORAGE_PUBLIC_BASE_URL` | Seller photos are shown without resizing |
| `UPLOAD_ORIGIN` | Origin of the API's `STORAGE_ENDPOINT_URL`, e.g. `https://<account>.r2.cloudflarestorage.com` | Photo uploads are blocked by the Content Security Policy whenever the API has storage switched on |

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
