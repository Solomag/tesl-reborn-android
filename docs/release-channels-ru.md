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

## Обновление Builder

CI основного репозитория выкладывает Builder в постоянные релизы:
`builder-test` (тестовая ветка, пред-релиз) и `builder-stable` (`main`). В
релизе — `TESL-Reborn-Builder-Test.exe` и `TESL-Reborn-Builder-Test` (Linux),
на stable `-Stable`, и тот же файл под старым именем `TESL-Reborn-Builder(.exe)`,
которое ищут Builder до переименования. APK называются так же:
`TESL-Reborn-Test-build46.apk`.
Номер сборки (= номер прогона CI) записан в подписи файла:
«TESL-Reborn-Builder.exe · build 7». Builder читает релиз через API GitHub
(`/releases/tags/builder-<канал>`): подпись даёт номер, поле `digest` — SHA-256
файла, посчитанный самим GitHub. Отдельных файлов-описаний нет. Номер и канал
вшиваются в Builder (`builder/version.json`, `tools/select_channel.py`);
публикует `tools/publish_builder.py`. API без входа даёт 60 запросов в час с
одного IP — проверке при запуске этого хватает.

Builder проверяет свой канал при запуске и по кнопке «Проверить обновления»,
спрашивает, скачивает новую сборку, сверяет SHA-256, переименовывает себя в
`*.old`, кладёт новую сборку на своё место и перезапускается; `*.old`
удаляется при следующем запуске. Во время сборки APK обновление не
предлагается. Без сети или при ошибке Builder работает на текущей версии.
Builder, собранный не CI основного репозитория, — «local build» (сборка 0).
