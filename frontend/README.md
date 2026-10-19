# CALL DNA frontend

React + Vite + Tailwind CSS v4.

## Run

```
npm install
copy .env.example .env      (Mac/Linux: cp .env.example .env)
npm run dev
```

Open http://localhost:5173. The backend must be running on http://localhost:8000
(change VITE_XRAY_API_URL in .env if it runs somewhere else).

## Files

- index.html            loads fonts and starts src/main.jsx
- src/main.jsx          mounts the app
- src/style.css         Tailwind + colours, fonts, animations
- src/xray/XRayApp.jsx  sidebar and page switching
- src/xray/CallDNA.jsx  Live call page (CALL DNA)
- src/xray/RevenueXRay.jsx  Insights page (Revenue X-Ray)
- src/xray/DNAStrand.jsx    the DNA fingerprint drawing
- src/xray/GelLanes.jsx     "how each reply turned out" chart
- src/xray/ui.jsx       shared panels, buttons, tags
- src/xray/api.js       calls to the backend
