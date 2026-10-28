# Проверка форка перед Pull Request

Этот документ относится к ветке `android-ui-and-update-loader`. Публикация в
своём форке не отправляет PR автору. Сначала проверяем свою ветку и устройство.
Текущая сборка ещё содержит имеющийся кеш всех языков; загрузка языков по выбору
будет следующим этапом.

## 1. Разместить изменения в своём форке

Создай форк https://github.com/ssorgatem/tesl-reborn-android/fork и предоставь
подключению GitHub доступ к нему. Подготовленную ветку можно загрузить туда
отдельно, без создания PR.

Для самостоятельной загрузки: сохрани `tesl-reborn-android.patch` в
`E:\TESL-build`, а затем в **WSL** выполни команды ниже. Здесь предполагается,
что форк назван `Solomag/tesl-reborn-android`.

```sh
git clone https://github.com/Solomag/tesl-reborn-android.git ~/tesl-reborn-android-review
cd ~/tesl-reborn-android-review
git switch -c android-ui-and-update-loader
git am /mnt/e/TESL-build/tesl-reborn-android.patch
git push -u origin android-ui-and-update-loader
```

Последняя команда использует твою локальную авторизацию GitHub для Git. Вместо
самостоятельного push можно предоставить доступ подключению и поручить загрузку
ветки ассистенту. Не загружай в git APK, OBB, DLL, кеш, данные входа и логи.

## 2. Проверить сборку из исходников

В WSL из новой папки проекта:

```sh
npm ci
python3 tools/prepare_emojis.py
npm run build
npm test
git diff --exit-code -- hook.js runtime/core.js runtime/manifest.json
```

Последняя команда должна завершиться без различий: это проверка воспроизводимости
сборки. Модельные тесты проверяют геометрию чата, историю, эмодзи, загрузчик и
целостность пакетов. Они не заменяют проверку на устройстве.

## 3. Подготовить полный тестовый APK без пересоздания кеша

Возьми свой существующий полный APK с рабочим кешем всех языков. В отличие от
`tesl-reborn-patched.apk` это большой APK примерно 2,6 ГБ. Например, исходный файл
мог сохраниться как
`E:\TESL-build\signed-all\all-languages-debugSigned.apk`.
Если он переименован, укажи его фактический путь.

В **WSL** из новой папки проекта:

```sh
python3 tools/prepare_test_apk.py /mnt/e/TESL-build/signed-all/all-languages-debugSigned.apk --output /mnt/e/TESL-build/tesl-reborn-review-unsigned.apk
```

Инструмент сохраняет исходный APK, существующие записи кеша и смещения нативных
библиотек; заменяет загрузчик, добавляет проверенные ресурсы эмодзи, проверяет
CRC архива и ZIP32. OBB остаётся прежним. Нужен свободный объём для ещё одной
копии APK; подписание создаст дополнительную копию.

Затем подпиши файл в **Windows PowerShell**, где Java уже работала:

```powershell
java -Xmx2g -jar E:\TESL-build\uber-apk-signer.jar -a E:\TESL-build\tesl-reborn-review-unsigned.apk --allowResign --skipZipAlign --out E:\TESL-build\review-signed
adb install -r "E:\TESL-build\review-signed\tesl-reborn-review-debugSigned.apk"
```

Путь последней команды должен совпасть с именем из строки `VERIFY` подписывателя.
Подпись должна быть той же, что у установленной игры. Используем обновление
через `-r`; удалять рабочую игру или её данные не нужно. При ошибке подписи или
нехватке места остановись на этой ошибке, а не удаляй игру.

## 4. Проверить игру и собрать результат

- Вход и повторный вход после полного перезапуска.
- Колоды: одна плашка статистики, без временной второй под ней.
- История: тап на обе стороны, переключение между колодами, закрытие вне плашки.
- Легендарные титулы: выбор титула и начало боя.
- Чат: длинные сообщения и ники, эмодзи, превью, перенос окна и pinch scaling.
- Перезапуск: сохранение положения и масштаба; затем сыграть полный матч.

В PowerShell можно начать журнал перед запуском игры и остановить его Ctrl+C:

```powershell
adb logcat -v threadtime -s tesl-hook:I Unity:E > E:\TESL-build\review-device.log
```

После запуска ожидается `hook build android-23-port-source`. Точную текущую и
ожидающую версии можно увидеть так:

```powershell
adb shell cat /sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-reborn-update-status.json
```

Проверку чистой установки и автоматического извлечения ресурсов нужно выполнять
на отдельном устройстве или тестовом профиле: обновление поверх рабочей игры не
проверяет этот сценарий полностью. APK, собираемый из чистого `base.apk`, также
нужно проверить отдельно перед заявлением, что вся исходная цепочка проверена.

## 5. Проверить обновление с GitHub без кабеля

В WSL из папки форка подготовь тестовый канал (замени имя форка/ветки, если они
отличаются):

```sh
python3 tools/publish_hook.py --revision 24 --version android-24-ota-test --channel test --base-url https://raw.githubusercontent.com/Solomag/tesl-reborn-android/android-ui-and-update-loader/updates
git add updates
git commit -m "Publish Android test update 24"
git push
```

Этот тест намеренно может использовать тот же код с новой ревизией: проверяется
доставка и сохранение состояния. При изменении `hook.ts` сначала снова выполняй
`npm run build` и `npm test`.

В Windows PowerShell один раз укажи канал. Путь к проекту доступен через WSL:

```powershell
& "\\wsl.localhost\Ubuntu-24.04\home\solo\tesl-reborn-android-review\tools\Configure-Updates.ps1" -FeedUrl "https://raw.githubusercontent.com/Solomag/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json"
```

Команда отключает локальный inbox, чтобы проверка действительно использовала
сеть. Если проект лежит в другой папке, скорректируй путь к скрипту.

После этого отключи кабель. Полностью останови игру через настройки Android,
запусти её с интернетом, подожди не менее 15 секунд и снова полностью останови
и запусти. Проверка выполняется один раз за запуск, применение — при следующем
запуске. Позже подключи кабель только для чтения статуса: ожидается
`current.revision: 24`, без `pending`.

Это проверяет скачивание и применение без ADB. Для просмотра результата пока
используется файл статуса; экран обновлений в самой игре ещё не реализован.

Для возвращения к встроенному коду запусти тот же PowerShell-скрипт с `-SafeMode`
и полностью перезапусти игру. Для выхода из safe mode снова укажи `-FeedUrl` без
`-SafeMode`.

## 6. Только после проверки — Pull Request

Зафиксируй проверенный коммит, модель телефона, Android, результат проверок и
оставшиеся ограничения. После этого отправляем PR автору исходного порта.
Реальные исправления публикуем в тестовый канал, проверяем на телефоне и затем
обновляем стабильный канал. Если каналы находятся в одном форке, для каждого
используется свой `manifest.json`, но номера ревизий должны расти при переходе
между каналами на одном телефоне.
