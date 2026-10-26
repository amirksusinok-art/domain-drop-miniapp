# Развёртывание и Telegram

## Render

`render.yaml` описывает один Node web service и PostgreSQL 17 в Frankfurt. API и frontend используют один origin. Сборка: `npm ci --include=dev && npm run build`; запуск: `npm start`. Health check: `/api/health`. Миграции выполняются перед открытием HTTP-порта под PostgreSQL advisory lock.

Blueprint использует бесплатные ресурсы **для тестового стенда**. Free web service засыпает; Free PostgreSQL имеет срок жизни 30 дней. Для реального запуска перейти на оплачиваемый web service и PostgreSQL с резервными копиями. Аукционы закрываются ближайшим scheduler pass (до 30 секунд при работающем процессе); после сна закрываются при запуске. Free-тариф не подходит для точного времени аукционов.

1. Создать Blueprint из этого репозитория в подтверждённом Render workspace.
2. Убедиться, что `DATABASE_URL` ссылается на внутреннее соединение `domain-drop-db` в том же регионе. Внешние подключения к БД закрыты.
3. Проверить реальный URL сервиса. Если Render добавил суффикс, изменить `APP_URL` на выданный HTTPS URL.
4. В Environment сервиса добавить `BOT_TOKEN`, `BOT_USERNAME`, `ADMIN_TELEGRAM_IDS` (ID владельца через запятую) и при необходимости `SUPPORT_USERNAME`. `WEBHOOK_SECRET` Blueprint генерирует автоматически.
5. Сохранить с перезапуском. _*Не добавлять секреты в GitHub, frontend или VITE_* переменные._*
6. Проверить `/api/health`, `/api/bootstrap` (`devAuth:false`) и отсутствие доступа к `/api/auth/dev`.

Сервис может безопасно стартовать до добавления BOT_TOKEN: API игры остаётся за авторизацией, mock-вход закрыт. Это состояние подготовки, а не завершённое подключение Telegram.

## Telegram

1. В официальном @BotFather создать бота через `/newbot`.
2. Добавить BOT_TOKEN в секреты backend, BOT_USERNAME без @, собственный Telegram ID в ADMIN_TELEGRAM_IDS.
3. Выполнить `npm run bot:setup` в окружении с этими серверными переменными — команда устанавливает webhook, menu button и /start, /help, /support. На Free Render без Shell можно выполнить локально с серверными секретами в игнорируемом `.env`; не публикуйте вывод/секреты.
4. В @BotFather → Bot Settings → Configure Mini App включить Main Mini App и указать HTTPS URL сервиса. Задать имя, описание и аватар.
5. Открыть `https://t.me/<BOT_USERNAME>?startapp` в Telegram. Проверить первый вход, бесплатный Spin, Keep/Sell, повторное открытие и Re-roll.

Авторизация принимает оригинальную строку `Telegram.WebApp.initData`; initDataUnsafe не является доказательством личности. Сессии хранятся на сервере, в браузере токен только в памяти. Запуск старше часа отклоняется, игровая сессия живёт 7 дней.

## Обновления и восстановление

- Перед изменением схемы — резервная копия БД и тест восстановления на отдельной базе.
- Добавлять новые нумерованные миграции, не менять уже применённые определения без миграции.
- Render rollback возвращает код, но не отменяет изменения БД. Миграции должны быть совместимы с предыдущей версией приложения.
- Следить за `/api/health`, ошибками scheduler, failed deploy и расходами ресурсов.
- Перед горизонтальным масштабированием заменить in-memory rate limiter общим хранилищем. PostgreSQL блокировки и idempotency уже действуют между процессами.
- Заявки, денежный ledger и audit сохраняются для разбирательства спорных операций. Политику хранения и архивирования определить перед массовым запуском.

Официальные источники: https://core.telegram.org/bots/webapps, https://render.com/docs/blueprint-spec, https://render.com/docs/free.
