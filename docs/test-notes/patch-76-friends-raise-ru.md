# Android 76: друзья в поиске без переноса объектов

Ревизия 76 (`android-76-raise-friends-without-moving`) переделывает доступ к
друзьям во время поиска матча по результатам разбора кода игры
(`libil2cpp.so` + `global-metadata.dat`, Il2CppDumper 6.7.46).

## Что делает игра

- Нажатие «Друзья»: `MainMenuOverlayView.HandleOnFriendsClick` →
  `MainMenuOverlayController.HandleOnFriends` → `MainMenu.HandleOnFriends` →
  `HandleNavigationWithRegistrationPrompt` → `FriendsWin.ToggleFriendsPanel`.
  Ни один шаг не проверяет поиск матча.
- `ToggleFriendsPanel` только прячет панель, если `_friendsPanel` активна, и
  показывает её иначе.
- Во время поиска игра кнопку не выключает: `SetBtnsInteractable`,
  `UpdateUi` и `SetCurrencyBtnsInteractable` вызываются только при входе в
  меню и из туториалов. Кнопка просто находится под модальным окном поиска.
- Кнопок и окон друзей по два: `_overlayViewMobile`/`_overlayViewDesktop` у
  `MainMenuOverlayController`, `_friendsWinMobile`/`_friendsWinDesktop` у
  `MainMenu`; рабочие — `get__overlayView()` и `MainMenu._friendsWin`.

## Что изменилось

Раньше хук переносил кнопку и `FriendsWin` в окно поиска и обратно. После
переноса кнопка переставала работать (отчёт 22), а возврат при входе в бой
задевал уничтожаемые объекты меню (отчёты 20, 21).

Теперь ничего не переносится:

- при показе поиска кнопка (из `MainMenuOverlayController.get__overlayView()`)
  и окно (`MainMenu._friendsWin`) получают `Canvas` с `overrideSorting` выше
  окна поиска и `GraphicRaycaster`;
- при закрытии (`HandleOnCancelSearch`, `OnDisable`, `OnDestroy`, сторож)
  сортировка и рейкастер возвращаются к исходным значениям; добавленные
  компоненты остаются выключенными;
- уничтоженные объекты пропускаются проверкой Unity (`op_Equality(obj, null)`),
  на них ничего не вызывается;
- состояние кнопки (`interactable`, активность) хук больше не трогает.

## Что проверить на телефоне

1. В логе: `matching friends: raised above the search window (order N)`.
2. Во время поиска кнопка «Друзья» видна поверх окна поиска и открывает
   панель друзей поверх него.
3. Отмена: `matching friends: lowered (HandleOnCancelSearch; 2 items)`; кнопка
   на своём месте и работает.
4. Вход в бой: `lowered (OnDisable; …)`, без вылета.

## Ревизия 77: рейкастер остаётся включённым

Отчёт 23: после того как кнопкой пользовались во время поиска, в главном меню
она переставала нажиматься. Причина — устройство Unity UI: `GraphicRaycaster`
попадает только по графике своего `Canvas`, а графика под вложенным `Canvas`
корневому рейкастеру меню больше не видна. Ревизия 76 при опускании
выключала добавленный рейкастер, и кнопка (а также содержимое окна друзей без
собственного `Canvas`) оставались без рейкастера. В ревизии 77
(`android-77-keep-friends-raycaster`) добавленный рейкастер после поиска
остаётся включённым; `Canvas` только перестаёт переопределять сортировку.
