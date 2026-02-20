# CreatorOS - YouTube Team In A Box

A multi-platform content management and live streaming platform with AI-powered automation for content creators.

## Tech Stack

- **Frontend**: React + Vite, Tailwind CSS, shadcn/ui, TanStack Query
- **Backend**: Express.js, Drizzle ORM
- **Database**: PostgreSQL
- **AI**: OpenAI (GPT)
- **Payments**: Stripe

## Prerequisites

- [Node.js](https://nodejs.org/) v20 or later
- [PostgreSQL](https://www.postgresql.org/) 15 or later
- npm (comes with Node.js)

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/creatoros.git
cd creatoros
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` with your actual API keys and database credentials.

### 4. Set up the database

Make sure PostgreSQL is running, then push the schema:

```bash
npm run db:push
```

### 5. Run the development server

```bash
npm run dev
```

The app will be available at `http://localhost:5000`.

### 6. Build for production

```bash
npm run build
npm start
```

## Project Structure

```
creatoros/
├── client/               # React frontend
│   └── src/
│       ├── components/   # Reusable UI components
│       ├── hooks/        # Custom React hooks
│       ├── lib/          # Utility functions
│       └── pages/        # Page components
├── server/               # Express.js backend
│   ├── lib/              # Shared utilities (logger, retry, cache)
│   ├── routes/           # API route handlers
│   └── *.ts              # Engine modules (autopilot, pipelines, etc.)
├── shared/               # Shared types and schemas
│   └── schema.ts         # Drizzle ORM database schema
├── migrations/           # Database migrations
└── .vscode/              # VS Code workspace settings
```

## VS Code Setup

When you open this project in VS Code, you'll be prompted to install recommended extensions. Accept the prompt for the best development experience, including:

- TypeScript support
- Tailwind CSS IntelliSense
- Prettier formatting
- Path autocompletion

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server (frontend + backend) |
| `npm run build` | Build for production |
| `npm start` | Run production build |
| `npm run check` | TypeScript type checking |
| `npm run db:push` | Push schema changes to database |

## Platform Integrations

CreatorOS connects to these platforms via OAuth:

- YouTube (content publishing + analytics)
- Twitch (live streaming)
- Kick (live streaming)
- TikTok (short-form video)
- X / Twitter (text + media posts)
- Discord (community announcements)

## License

MIT
