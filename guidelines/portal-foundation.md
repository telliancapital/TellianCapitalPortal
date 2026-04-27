# Portal Foundation

> Stand: 2026-04-27

## Architektur

| Entscheidung | Gewaehlt |
|---|---|
| Framework | Next.js (App Router) |
| Auth | Supabase Auth (noch nicht integriert) |
| Storage | Supabase Storage (noch nicht integriert) |
| Deploy | Vercel (Subdomain) |
| Design-Tokens | Kopiert aus Hauptseite (theme.css) |

## Auth-State-Mock

**Datei:** `src/lib/auth.tsx`

React Context mit boolean `isAuthenticated`. Login setzt true,
Logout setzt false. Kein persistenter State (Reload = ausgeloggt).

**Spaeter ersetzen durch:**
- Supabase `createClientComponentClient()`
- `supabase.auth.signInWithPassword()` im Login
- `supabase.auth.signOut()` im Logout
- Middleware (`middleware.ts`) fuer serverseitigen Route-Schutz

## Dokumenten-Liste

### Mock-Daten-Struktur

```typescript
interface Document {
  id: string;
  title: string;       // z.B. "Q4 2025 Performance-Report"
  type: string;        // "Quartalsbericht" | "Monatsbericht"
  date: Date;          // Fuer Sortierung und Anzeige
  fileSize: string;    // z.B. "2.4 MB"
  fileFormat: string;  // Immer "PDF" in V1
}
```

Mock-Array: 10 Dokumente, 2024-2026, chronologisch absteigend.
Definiert als `MOCK_DOCUMENTS` in `src/app/page.tsx`.

### Was vom Backend kommen muss

1. **Auth Session** → User-ID
2. **Storage List** → `supabase.storage.from("docs").list(userId)`
3. **Signed URLs** → zeitbegrenzte Download-Links pro Dokument
4. **File Metadata** → Titel, Typ, Datum, Groesse (aus Storage
   oder separater Tabelle)

## Was steht noch aus

| Feature | Status | Blocker |
|---|---|---|
| Auth-Provider (Supabase) | Nicht integriert | Supabase-Projekt muss erstellt werden |
| Storage-Backend | Nicht integriert | Supabase-Projekt + Bucket-Struktur |
| Echte Downloads | console.log Placeholder | Storage-Backend |
| Admin-Upload-Sicht | Nicht gebaut | Eigene Route oder Supabase Dashboard |
| Middleware (SSR Auth) | Nicht gebaut | Auth-Provider zuerst |
| Persistenter Login | Nicht vorhanden | Supabase Session-Management |
| Error-Handling (Auth) | Hardcoded Placeholder | Auth-Provider |
| "Passwort vergessen" | Link vorhanden, nicht verdrahtet | Auth-Provider |
