# Product Overview: Bot-WPP

## Purpose
Bot-WPP is a multifunctional WhatsApp bot that automates group interactions, provides AI-powered responses, and manages group moderation. It is designed for WhatsApp group administrators who want to automate tasks, enforce rules, and engage users.

## Key Features
- **AI Integration**: Gemini API for intelligent, context-aware responses.
- **Command System**: 40+ commands triggered by `$` prefix (e.g., `$ping`, `$ban`, `$sorteio`, `$clima`).
- **Group Moderation**: Auto-moderation of links, betting keywords, spam, and unwanted content.
- **Geolocation**: Distributed system (Frontend → Relay → Bot) to capture and relay user GPS coordinates.
- **Games**: Built-in games like Jogo da Velha (Tic-Tac-Toe), Forca (Hangman), and voting systems.
- **Reminders & Alarms**: Scheduled messages and alarms for group members.
- **Welcome System**: Configurable welcome messages for new group members.
- **Custom Commands**: Dynamic commands stored in the relay service, configurable at runtime.
- **Multi-Platform Architecture**: Adapters for WhatsApp, Discord, and Telegram (extensible).
- **Metrics & Monitoring**: Prometheus metrics, Grafana dashboards, and Winston logging.
- **Usage Tracking**: Per-user command usage statistics.

## Target Users
- WhatsApp group administrators and community managers.
- Developers extending the bot with new commands or platform adapters.

## Use Cases
- Automated group moderation (anti-spam, anti-link, anti-bet).
- Interactive group games and entertainment.
- Information retrieval (weather, news, jokes, advice).
- Group management (kick, ban, promote, mute).
- Location tracking for specific use cases.
- Scheduled reminders and alarms.
