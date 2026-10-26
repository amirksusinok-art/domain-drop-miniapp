# DOMAIN DROP

Telegram Mini App для коллекционирования **виртуальных** доменов. React + TypeScript + Vite, Node.js + TypeScript, PostgreSQL. Бот открывает приложение; сама игра работает в WebView.

## Быстрый запуск

Требуется Node.js 22 или новее.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Откройте адрес, указанный Vite. Если порт 5173 зарезервирован Windows, используйте `npx vite --host 127.0.0.1 --port 42731` вместе с `npx tsx watch server/index.ts`.

Без `DATABASE_URL` development использует **PGlite** — локальный PostgreSQL в `.local-db/`, с сохранением между запусками. Это не in-memory mock экономики. В production встроенная база запрещена: нужен отдельный PostgreSQL.

Для полноценного локального PostgreSQL:

```sh
docker compose up -d
```

В `.env` задайте `DATABASE_URL=postgres://domaindrop:local-development-only@localhost:5432/domaindrop`. Миграции выполняются при старте; отдельно — `npm run db:migrate`.

`DEV_AUTH=true` включает тестового Telegram-пользователя. В production эта настройка приводит к отказу запуска. Не публикуйте dev-сервер в интернете.

## Реализовано

- Проверка Telegram initData, срок действия, непрозрачные серверные сессии; mock-вход только локально.
- 10 000 стартовых coins, первый бесплатный Spin, 500 за последующие; ежедневные 1 000 coins.
- Серверная генерация, 27 TLD, Domain Score, 6 редкостей, Perfect Match, подробная оценка.
- Pity с гарантией Rare+ к 30-му выпадению, один ежедневный Re-roll и редкие токены.
- Keep/Sell, восстановление pending-результата, коллекция, поиск, сортировка, теги, избранное, сейф.
- Daily Quests, XP, уровни, награды, наборы, достижения и темы без влияния на шансы.
- Аукцион с резервированием ставки, возвратом проигравшему и выдачей лота победителю.
- Scanner с тремя серверными скрытыми картами, выбором одной и показом пропущенных.
- Публичный Showcase, рейтинг коллекций, TLD-события, административная конфигурация и аудит.
- Mobile-first интерфейс, Card Decryption с посимвольной фиксацией, отдельным TLD reveal, FAST SPIN, ускорением тапом, Re-roll disintegration, опциональными звуками, Telegram haptics и reduced motion.

Одинаковый адрес может выпадать повторно: каждый экземпляр имеет свой UUID. Имя, зона, редкость, score и стоимость неизменяемы; база данных блокирует переписывание характеристик. Изменения админ-конфигурации касаются только новых выпадений.

## Проверки

```sh
npm test
npm run build
npm run economy -- 1000000
```

Тесты по умолчанию работают на временном PGlite. Для PostgreSQL задайте `TEST_DATABASE_URL` **на отдельную пустую тестовую базу**, никогда на production. Готовый шаблон GitHub Actions сохранён в `docs/ci.example.yml`: скопируйте его в `.github/workflows/ci.yml` после подключения прав workflow. До этого сборка и тесты запускаются локально. Шаблон проверяет PostgreSQL 17, сборку и зависимости.

Симуляция измеряет платные обычные вращения с Pity; бесплатный первый Spin, Re-roll, ежедневные/quest награды и события в RTP не входят. Цель — около 85%, не гарантия для конкретного игрока. Изменение цен, весов или Pity требует повторной симуляции.

## Production

Инструкции: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Архитектура: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Безопасность: [docs/SECURITY.md](docs/SECURITY.md).

В приложении нет настоящих платежей, cash-out и регистрации доменов. Нет Fusion, Upgrade, смены TLD и повышения редкости.
