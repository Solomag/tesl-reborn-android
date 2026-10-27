# Каналы обновлений: stable и test

Оба канала живут в основном репозитории `ssorgatem/tesl-reborn-android`:

| Канал | Ветка | Манифест |
| --- | --- | --- |
| test | `android-ui-and-update-loader` | `updates/test/manifest.json` |
| stable | `main` | `updates/stable/manifest.json` |

Адреса — в `runtime/channel.json` (`channels`). Payload'ы адресуются по SHA-256
и лежат в `updates/payloads/` обеих веток.

## Какой канал получает APK

Builder вшивает в APK канал по умолчанию (`hookFeed`) и оба адреса
(`hookChannels`). В CI `tools/select_channel.py` выбирает stable только для
`main` основного репозитория; любая другая ветка, PR, форк и локальная сборка —
test.

Телефон сохраняет канал, полученный при первом запуске
(`tesl-reborn-updater.json`), и новый APK его не меняет. Сменить канал можно в
Game Data → Advanced → «Канал обновлений» (Stable / Test); применяется со
следующего запуска игры.

## Публикация в test

Как раньше, но с адресом основного репозитория:

```bash
python tools/publish_hook.py --revision N --version android-N-… --channel test \
  --base-url https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/android-ui-and-update-loader/updates
```

Коммит и push в `android-ui-and-update-loader` основного репозитория.

## Продвижение в stable

Стабильный манифест коммитится в тестовую ветку, но указывает на `main`. Тогда
продвижение — это перемотка `main` до проверенного коммита, без слияний:

```bash
python tools/publish_hook.py --hook updates/payloads/<sha256>.js --revision N \
  --version android-N-… --channel stable \
  --base-url https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/main/updates
git commit -m "Promote patch N to stable" updates/stable/manifest.json
git push upstream HEAD:android-ui-and-update-loader
git push upstream HEAD:main
```

Ревизия stable не может быть ниже уже установленной у телефона: при переходе с
Test на Stable телефон остаётся на своей ревизии, пока stable её не догонит.

## Переезд с форка

Тестовый канал раньше был в форке `Solomag/tesl-reborn-android`. У уже
установленных телефонов записан его адрес. OTA 85 (секция `channel-migration`
хука) один раз переписывает этот адрес на тестовую ветку основного
репозитория; в логе — `updater: channel migration migrated …`. OTA 85
публикуется и в форк, после этого форк для обновлений больше не нужен.
