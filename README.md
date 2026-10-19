# Call guide + CALL DNA

A caller has a prospect on the phone and this screen open beside it. The screen keeps them on the structure of the call.

**Call guide** (`Call` page)
- Which stage the call is in, and what that stage is for
- What prospects tend to say at that point (written for each stage, plus the lines heard most on past calls)
- A tap for what happened at the stage, and a box for the prospect's own words
- Then the next stage, then the outcome of the call (enrolled, follow-up booked, not interested)
- Saved as you go; every stage is stored the moment you move on

**Past calls** (`Past` page): every saved call, who made it, the stage it reached and its outcome. Tap a call to see each stage and what the prospect said.

**Extras that learn from the calls**
- **Call DNA**: when a prospect raises a concern, see how the same moment went on past calls and which reply moved them forward.
- **Insights (Revenue X-Ray)**: where prospects stall, what they said, and experiments to fix it.

## Stack (all free tier)

| Part | Where | Folder |
|---|---|---|
| Data: calls, stages, stage results, prospect's words, outcome | Supabase | `supabase/setup_all.sql` |
| Backend: start call, save stage, close call, list calls, health | Render | `backend/` |
| Screen | Vercel | `frontend/` |

## API

| Method | Path | What it does |
|---|---|---|
| `POST` | `/calls` | Start a call. Body: `{"caller_name": "Ananya", "prospect_name": "Lead #2050"}` |
| `POST` | `/calls/{id}/stages` | Save a stage result. Body: `{"stage_key": "fees", "result": "fee_ok", "prospect_words": "EMI works for me"}` |
| `POST` | `/calls/{id}/close` | Close the call. Body: `{"outcome": "enrolled" \| "follow_up" \| "not_interested", "notes": "..."}` |
| `GET` | `/calls` | List past calls with the stage each reached. Optional `?outcome=enrolled` |
| `GET` | `/calls/{id}` | One call with every stage result |
| `GET` | `/calls/guide` | Stages: purpose, what prospects tend to say, the result taps |
| `GET` | `/health` | Health check, including the database |

Interactive docs: `http://localhost:8000/docs`

## Run locally

1. **Database (once):** Supabase > SQL Editor > New query > paste all of `supabase/setup_all.sql` > Run. You should see 7 stages.
2. **Backend:**
   ```
   cd backend
   python -m venv venv
   venv\Scripts\activate            (Mac/Linux: source venv/bin/activate)
   pip install -r requirements.txt
   copy .env.example .env           (Mac/Linux: cp)  then put your Supabase URI in DATABASE_URL
   python seed_demo.py --reset      demo data + 6 sample calls
   uvicorn app.main:app --reload --port 8000
   ```
3. **Frontend** (works on Node 18 or newer):
   ```
   cd frontend
   npm install
   copy .env.example .env
   npm run dev
   ```
   Open http://localhost:5173

## Deploy

**Render (backend)**
1. Push this project to GitHub.
2. Render > New > Web Service > pick the repo (or New > Blueprint, which reads `render.yaml`).
3. Root directory `backend`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, plan Free.
4. Environment: `DATABASE_URL` (Supabase transaction pooler URI) and `CORS_ORIGINS` (your Vercel URL, added after step 2 of Vercel).
5. Check `https://<your-service>.onrender.com/health` shows `"database": "ok"`.

**Vercel (screen)**
1. Vercel > Add New > Project > pick the repo.
2. Root directory `frontend`, framework Vite.
3. Environment: `VITE_XRAY_API_URL` = your Render URL.
4. Deploy, then put the Vercel URL into Render's `CORS_ORIGINS` and redeploy Render.

The free Render service sleeps when idle; the first request after a pause can take up to a minute. The screen says so while it waits.

## Privacy

Phone numbers and emails typed into the prospect's words are replaced with `[phone]` / `[email]` before saving.
