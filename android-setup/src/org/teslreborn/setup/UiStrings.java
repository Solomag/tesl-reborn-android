package org.teslreborn.setup;

import java.util.*;

/** UI translations; English is the default and fallback. */
final class UiStrings {
  private static final Map<String, String[]> TEXT = new HashMap<>();

  static {
    TEXT.put("Checking Reborn update…",new String[]{"Checking Reborn update…","Reborn-Update prüfen…","Buscando actualización de Reborn…","Buscando actualización de Reborn…","Recherche de mise à jour Reborn…","Verifica aggiornamento Reborn…","Sprawdzanie aktualizacji Reborn…","Verificando atualização do Reborn…","Проверяем обновление Reborn…","Reborn güncellemesi denetleniyor…"});
    TEXT.put("Downloading Reborn update…",new String[]{"Downloading Reborn update…","Reborn-Update herunterladen…","Descargando actualización de Reborn…","Descargando actualización de Reborn…","Téléchargement de Reborn…","Download aggiornamento Reborn…","Pobieranie aktualizacji Reborn…","Baixando atualização do Reborn…","Скачиваем обновление Reborn…","Reborn güncellemesi indiriliyor…"});
    TEXT.put("Verifying Reborn update…",new String[]{"Verifying Reborn update…","Reborn-Update prüfen…","Verificando actualización de Reborn…","Verificando actualización de Reborn…","Vérification de Reborn…","Verifica aggiornamento Reborn…","Weryfikacja aktualizacji Reborn…","Verificando atualização do Reborn…","Проверяем загруженное обновление…","Reborn güncellemesi doğrulanıyor…"});
    TEXT.put("Play now",new String[]{"Play now","Jetzt spielen","Jugar ahora","Jugar ahora","Jouer maintenant","Gioca ora","Graj teraz","Jogar agora","Играть сейчас","Şimdi oyna"});

    TEXT.put("All language packs are installed", new String[] {"All language packs are installed","Alle Sprachpakete sind installiert","Todos los idiomas están instalados","Todos los idiomas están instalados","Toutes les langues sont installées","Tutte le lingue sono installate","Wszystkie języki są zainstalowane","Todos os idiomas estão instalados","Все языковые пакеты уже установлены","Tüm dil paketleri kurulu"});
    TEXT.put("All available languages are already on this phone. Connect to your PC only to check for newer packs or reinstall them.", new String[] {"All available languages are already on this phone. Connect to your PC only to check for newer packs or reinstall them.","Alle verfügbaren Sprachen sind bereits auf diesem Handy. Verbinde den PC nur zum Prüfen neuer Pakete oder zur Neuinstallation.","Todos los idiomas disponibles ya están en el teléfono. Conecta el PC solo para buscar paquetes nuevos o reinstalarlos.","Todos los idiomas disponibles ya están en el teléfono. Conecta el PC solo para buscar paquetes nuevos o reinstalarlos.","Toutes les langues sont déjà sur ce téléphone. Connectez le PC pour rechercher de nouveaux packs ou les réinstaller.","Tutte le lingue sono già sul telefono. Collega il PC solo per aggiornare o reinstallare i pacchetti.","Wszystkie języki są już na telefonie. Połącz PC tylko, aby sprawdzić aktualizacje lub ponownie je zainstalować.","Todos os idiomas já estão no celular. Conecte o PC só para atualizar ou reinstalar os pacotes.","Все доступные языки уже есть на телефоне. Подключение к ПК нужно только для проверки новых пакетов или повторной установки.","Tüm diller zaten bu telefonda. Yalnızca yeni paketleri denetlemek veya yeniden kurmak için PC’ye bağlanın."});
    TEXT.put("Check PC anyway", new String[] {"Check PC anyway","Trotzdem PC prüfen","Consultar el PC","Consultar el PC","Vérifier le PC","Controlla il PC","Sprawdź PC mimo to","Consultar o PC","Всё равно проверить ПК","Yine de PC’yi denetle"});

    TEXT.put("Diagnostics", new String[] {
      "Diagnostics",
      "Diagnose",
      "Diagnóstico",
      "Diagnóstico",
      "Diagnostic",
      "Diagnostica",
      "Diagnostyka",
      "Diagnóstico",
      "Диагностика",
      "Tanılama"
    });
    TEXT.put("Share diagnostic report", new String[] {
      "Share diagnostic report",
      "Diagnosebericht teilen",
      "Compartir informe de diagnóstico",
      "Compartir informe de diagnóstico",
      "Partager le rapport de diagnostic",
      "Condividi rapporto diagnostico",
      "Udostępnij raport diagnostyczny",
      "Compartilhar relatório de diagnóstico",
      "Поделиться отчётом об ошибках",
      "Tanılama raporunu paylaş"
    });
    TEXT.put("Share logs and version details.", new String[] {
      "Share logs and version details.",
      "Protokolle und Versionsdetails teilen.",
      "Comparte registros y versiones.",
      "Comparte registros y versiones.",
      "Partager les journaux et les versions.",
      "Condividi registri e versioni.",
      "Udostępnij dzienniki i wersje.",
      "Compartilhe logs e versões.",
      "Отправить журнал ошибок и сведения о версиях.",
      "Günlükleri ve sürüm bilgilerini paylaş."
    });
    TEXT.put("Preparing diagnostic report…", new String[] {
      "Preparing diagnostic report…",
      "Diagnosebericht wird erstellt…",
      "Preparando informe…",
      "Preparando informe…",
      "Préparation du rapport…",
      "Preparazione del rapporto…",
      "Przygotowywanie raportu…",
      "Preparando relatório…",
      "Подготовка отчёта…",
      "Rapor hazırlanıyor…"
    });
    TEXT.put("Report ready. Choose where to share it.", new String[] {
      "Report ready. Choose where to share it.",
      "Bericht fertig. Ziel zum Teilen auswählen.",
      "Informe listo. Elige dónde compartirlo.",
      "Informe listo. Elige dónde compartirlo.",
      "Rapport prêt. Choisissez une application.",
      "Rapporto pronto. Scegli dove condividerlo.",
      "Raport gotowy. Wybierz aplikację.",
      "Relatório pronto. Escolha onde compartilhar.",
      "Отчёт готов. Выберите, куда его отправить.",
      "Rapor hazır. Paylaşılacak uygulamayı seçin."
    });
    TEXT.put("Could not share report.", new String[] {
      "Could not share report.",
      "Bericht konnte nicht geteilt werden.",
      "No se pudo compartir el informe.",
      "No se pudo compartir el informe.",
      "Impossible de partager le rapport.",
      "Impossibile condividere il rapporto.",
      "Nie udało się udostępnić raportu.",
      "Não foi possível compartilhar o relatório.",
      "Не удалось отправить отчёт.",
      "Rapor paylaşılamadı."
    });
    TEXT.put("Could not prepare report.", new String[] {
      "Could not prepare report.",
      "Bericht konnte nicht erstellt werden.",
      "No se pudo preparar el informe.",
      "No se pudo preparar el informe.",
      "Impossible de préparer le rapport.",
      "Impossibile preparare il rapporto.",
      "Nie udało się przygotować raportu.",
      "Não foi possível preparar o relatório.",
      "Не удалось подготовить отчёт.",
      "Rapor hazırlanamadı."
    });
    TEXT.put(
        "Automatic patch updates",
        new String[] {
          "Automatic patch updates",
          "Automatische Patch-Updates",
          "Actualizaciones automáticas de parches",
          "Actualizaciones automáticas de parches",
          "Mises à jour automatiques du patch",
          "Aggiornamenti automatici della patch",
          "Automatyczne aktualizacje łatki",
          "Atualizações automáticas do patch",
          "Автоматические обновления патча",
          "Otomatik yama güncellemeleri"
        });
    TEXT.put(
        "standard",
        new String[] {
          "standard", "Standard", "estándar", "estándar", "standard", "standard", "standardowa", "padrão",
          "стандарт", "standart"
        });
    TEXT.put(
        "Render resolution",
        new String[] {
          "Render resolution", "Renderauflösung", "Resolución de renderizado", "Resolución de renderizado",
          "Résolution de rendu", "Risoluzione di rendering", "Rozdzielczość renderowania", "Resolução de renderização",
          "Разрешение рендера", "İşleme çözünürlüğü"
        });
    TEXT.put(
        "Lower resolution draws fewer pixels: faster and cooler, slightly softer. Applies on the next game start.",
        new String[] {
          "Lower resolution draws fewer pixels: faster and cooler, slightly softer. Applies on the next game start.",
          "Geringere Auflösung zeichnet weniger Pixel: schneller und kühler, etwas weicher. Gilt ab dem nächsten Spielstart.",
          "Menor resolución dibuja menos píxeles: más rápido y menos calor, algo más suave. Se aplica en el próximo inicio.",
          "Menor resolución dibuja menos píxeles: más rápido y menos calor, algo más suave. Se aplica en el próximo inicio.",
          "Une résolution plus basse dessine moins de pixels : plus rapide et moins chaud, un peu plus doux. S’applique au prochain lancement.",
          "Una risoluzione più bassa disegna meno pixel: più veloce e meno calore, un po' più morbida. Si applica al prossimo avvio.",
          "Niższa rozdzielczość rysuje mniej pikseli: szybciej i chłodniej, nieco miękciej. Działa od następnego uruchomienia.",
          "Resolução menor desenha menos pixels: mais rápido e menos calor, um pouco mais suave. Aplica-se no próximo início.",
          "Меньшее разрешение рисует меньше пикселей: быстрее и меньше греет, картинка чуть мягче. Применится при следующем запуске игры.",
          "Düşük çözünürlük daha az piksel çizer: daha hızlı ve serin, biraz daha yumuşak. Bir sonraki oyun başlangıcında uygulanır."
        });
    TEXT.put(
        "Show FPS counter",
        new String[] {
          "Show FPS counter", "FPS-Zähler anzeigen", "Mostrar contador de FPS", "Mostrar contador de FPS",
          "Afficher le compteur d’IPS", "Mostra contatore FPS", "Pokaż licznik FPS", "Mostrar contador de FPS",
          "Показывать счётчик FPS", "FPS sayacını göster"
        });
    TEXT.put(
        "Frame rate",
        new String[] {
          "Frame rate", "Bildrate", "Fotogramas por segundo", "Fotogramas por segundo",
          "Images par seconde", "Frequenza fotogrammi", "Liczba klatek", "Taxa de quadros",
          "Частота кадров", "Kare hızı"
        });
    TEXT.put(
        "The highest frame rate; a phone that cannot hold it is lowered automatically. Applies on the next game start.",
        new String[] {
          "The highest frame rate; a phone that cannot hold it is lowered automatically. Applies on the next game start.",
          "Die höchste Bildrate; hält das Telefon sie nicht, wird sie automatisch gesenkt. Gilt ab dem nächsten Spielstart.",
          "La tasa máxima; si el teléfono no la sostiene, se reduce automáticamente. Se aplica en el próximo inicio.",
          "La tasa máxima; si el teléfono no la sostiene, se reduce automáticamente. Se aplica en el próximo inicio.",
          "La fréquence maximale ; si le téléphone ne la tient pas, elle baisse automatiquement. S’applique au prochain lancement.",
          "La frequenza massima; se il telefono non la regge, viene abbassata automaticamente. Si applica al prossimo avvio.",
          "Najwyższa liczba klatek; jeśli telefon jej nie utrzyma, zostanie automatycznie obniżona. Działa od następnego uruchomienia.",
          "A taxa máxima; se o telefone não a mantiver, ela é reduzida automaticamente. Aplica-se no próximo início.",
          "Верхний предел частоты кадров; если телефон его не держит, частота снижается автоматически. Применится при следующем запуске игры.",
          "En yüksek kare hızı; telefon bunu tutamazsa otomatik olarak düşürülür. Bir sonraki oyun başlangıcında uygulanır."
        });
    TEXT.put(
        "Update channel",
        new String[] {
          "Update channel",
          "Update-Kanal",
          "Canal de actualizaciones",
          "Canal de actualizaciones",
          "Canal de mises à jour",
          "Canale di aggiornamento",
          "Kanał aktualizacji",
          "Canal de atualizações",
          "Канал обновлений",
          "Güncelleme kanalı"
        });
    TEXT.put(
        "Stable",
        new String[] {
          "Stable", "Stabil", "Estable", "Estable", "Stable", "Stabile", "Stabilny", "Estável",
          "Стабильный", "Kararlı"
        });
    TEXT.put(
        "Test",
        new String[] {
          "Test", "Test", "Pruebas", "Pruebas", "Test", "Test", "Testowy", "Teste", "Тестовый", "Test"
        });
    TEXT.put(
        "The channel applies on the next game start. Test gets new patches first and may be less stable.",
        new String[] {
          "The channel applies on the next game start. Test gets new patches first and may be less stable.",
          "Der Kanal gilt ab dem nächsten Spielstart. Test erhält neue Patches zuerst und kann weniger stabil sein.",
          "El canal se aplica en el próximo inicio del juego. Pruebas recibe antes los parches y puede ser menos estable.",
          "El canal se aplica en el próximo inicio del juego. Pruebas recibe antes los parches y puede ser menos estable.",
          "Le canal s’applique au prochain lancement. Test reçoit les patchs en premier et peut être moins stable.",
          "Il canale si applica al prossimo avvio. Test riceve prima le patch e può essere meno stabile.",
          "Kanał zadziała przy następnym uruchomieniu gry. Testowy dostaje łatki wcześniej i może być mniej stabilny.",
          "O canal vale a partir da próxima abertura do jogo. Teste recebe os patches antes e pode ser menos estável.",
          "Канал применится при следующем запуске игры. Тестовый получает патчи раньше и может быть менее стабильным.",
          "Kanal bir sonraki oyun açılışında uygulanır. Test yamaları önce alır ve daha az kararlı olabilir."
        });
    TEXT.put(
        "Show Ctrl+D test area",
        new String[] {
          "Show Ctrl+D test area",
          "Ctrl+D-Testbereich anzeigen",
          "Mostrar zona de prueba Ctrl+D",
          "Mostrar zona de prueba Ctrl+D",
          "Afficher la zone de test Ctrl+D",
          "Mostra area di prova Ctrl+D",
          "Pokaż obszar testowy Ctrl+D",
          "Mostrar área de teste Ctrl+D",
          "Показать область проверки Ctrl+D",
          "Ctrl+D test alanını göster"
        });
    TEXT.put(
        "Updates apply on the next game start.",
        new String[] {
          "Updates apply on the next game start.",
          "Updates werden beim nächsten Spielstart angewendet.",
          "Las actualizaciones se aplican al reiniciar el juego.",
          "Las actualizaciones se aplican al reiniciar el juego.",
          "Les mises à jour sont appliquées au prochain démarrage.",
          "Gli aggiornamenti si applicano al prossimo avvio.",
          "Aktualizacje są stosowane przy następnym uruchomieniu gry.",
          "As atualizações são aplicadas ao reiniciar o jogo.",
          "Обновления применяются при следующем запуске игры.",
          "Güncellemeler oyunun sonraki açılışında uygulanır."
        });
    TEXT.put(
        "Update downloaded. Restart the game.",
        new String[] {
          "Update downloaded. Restart the game.",
          "Update heruntergeladen. Spiel neu starten.",
          "Actualización descargada. Reinicia el juego.",
          "Actualización descargada. Reinicia el juego.",
          "Mise à jour téléchargée. Relancez le jeu.",
          "Aggiornamento scaricato. Riavvia il gioco.",
          "Aktualizacja pobrana. Uruchom grę ponownie.",
          "Atualização baixada. Reinicie o jogo.",
          "Обновление скачано. Перезапустите игру.",
          "Güncelleme indirildi. Oyunu yeniden başlat."
        });
    TEXT.put(
        "Up to date",
        new String[] {
          "Up to date",
          "Aktuell",
          "Actualizado",
          "Actualizado",
          "À jour",
          "Aggiornato",
          "Aktualne",
          "Atualizado",
          "Установлена актуальная версия",
          "Güncel"
        });
    TEXT.put(
        "Update check failed. Retry on the next game start.",
        new String[] {
          "Update check failed. Retry on the next game start.",
          "Update-Prüfung fehlgeschlagen. Neuer Versuch beim nächsten Spielstart.",
          "Error al buscar actualizaciones. Se reintentará al iniciar el juego.",
          "Error al buscar actualizaciones. Se reintentará al iniciar el juego.",
          "Échec de la recherche. Nouvel essai au prochain démarrage.",
          "Controllo aggiornamenti fallito. Nuovo tentativo al prossimo avvio.",
          "Nie udało się sprawdzić aktualizacji. Ponowna próba przy następnym uruchomieniu.",
          "Falha ao buscar atualizações. Nova tentativa ao iniciar o jogo.",
          "Не удалось проверить обновления. Повтор при следующем запуске игры.",
          "Güncelleme kontrolü başarısız. Sonraki açılışta yeniden denenecek."
        });
    TEXT.put(
        "Game language at launch",
        new String[] {
          "Game language at launch",
          "Spielsprache beim Start",
          "Idioma al iniciar el juego",
          "Idioma al iniciar el juego",
          "Langue au lancement du jeu",
          "Lingua all’avvio del gioco",
          "Język przy uruchomieniu gry",
          "Idioma ao iniciar o jogo",
          "Язык игры при запуске",
          "Oyun başlatma dili"
        });
    TEXT.put(
        "Choose language packs and download",
        new String[] {
          "Choose language packs and download",
          "Sprachpakete auswählen und herunterladen",
          "Elegir y descargar paquetes de idiomas",
          "Elegir y descargar paquetes de idiomas",
          "Choisir et télécharger les langues",
          "Scegli e scarica pacchetti lingua",
          "Wybierz i pobierz pakiety językowe",
          "Escolher e baixar pacotes de idiomas",
          "Выбрать и скачать языковые пакеты",
          "Dil paketlerini seç ve indir"
        });
    TEXT.put(
        "Download the missing language pack, then launch the game.",
        new String[] {
          "Download the missing language pack, then launch the game.",
          "Lade das fehlende Sprachpaket herunter und starte dann das Spiel.",
          "Descarga el idioma que falta y luego inicia el juego.",
          "Descarga el idioma que falta y luego inicia el juego.",
          "Téléchargez la langue manquante, puis lancez le jeu.",
          "Scarica la lingua mancante, poi avvia il gioco.",
          "Pobierz brakujący język, a następnie uruchom grę.",
          "Baixe o idioma ausente e inicie o jogo.",
          "Скачайте недостающий языковой пакет, затем запустите игру.",
          "Eksik dil paketini indir, ardından oyunu başlat."
        });
    TEXT.put(
        "Game data setup",
        new String[] {
          "Game data setup",
          "Spieldaten einrichten",
          "Preparar datos del juego",
          "Preparar datos del juego",
          "Préparer les données",
          "Prepara dati di gioco",
          "Przygotowanie danych gry",
          "Preparar dados do jogo",
          "Подготовка данных игры",
          "Oyun verilerini hazırla"
        });
    TEXT.put(
        "Game language",
        new String[] {
          "Game language",
          "Spielsprache",
          "Idioma del juego",
          "Idioma del juego",
          "Langue du jeu",
          "Lingua del gioco",
          "Język gry",
          "Idioma do jogo",
          "Язык игры",
          "Oyun dili"
        });
    TEXT.put(
        "Import OBB file",
        new String[] {
          "Import OBB file",
          "OBB-Datei importieren",
          "Importar archivo OBB",
          "Importar archivo OBB",
          "Importer un fichier OBB",
          "Importa file OBB",
          "Importuj plik OBB",
          "Importar arquivo OBB",
          "Импортировать файл OBB",
          "OBB dosyasını içe aktar"
        });
    TEXT.put(
        "Install included language packs",
        new String[] {
          "Install included language packs",
          "Enthaltene Sprachpakete installieren",
          "Instalar idiomas incluidos",
          "Instalar idiomas incluidos",
          "Installer les langues incluses",
          "Installa lingue incluse",
          "Zainstaluj dołączone języki",
          "Instalar idiomas incluídos",
          "Установить встроенные языки",
          "Dahil edilen dilleri yükle"
        });
    TEXT.put(
        "Remove selected language",
        new String[] {
          "Remove selected language",
          "Gewählte Sprache entfernen",
          "Eliminar idioma seleccionado",
          "Eliminar idioma seleccionado",
          "Supprimer la langue sélectionnée",
          "Rimuovi lingua selezionata",
          "Usuń wybrany język",
          "Remover idioma selecionado",
          "Удалить выбранный язык",
          "Seçili dili kaldır"
        });
    TEXT.put(
        "Launch game",
        new String[] {
          "Launch game",
          "Spiel starten",
          "Iniciar juego",
          "Iniciar juego",
          "Lancer le jeu",
          "Avvia gioco",
          "Uruchom grę",
          "Iniciar jogo",
          "Запустить игру",
          "Oyunu başlat"
        });
    TEXT.put(
        "Base game data (OBB)",
        new String[] {
          "Base game data (OBB)",
          "Basis-Spieldaten (OBB)",
          "Datos base del juego (OBB)",
          "Datos base del juego (OBB)",
          "Données de base (OBB)",
          "Dati di base (OBB)",
          "Podstawowe dane gry (OBB)",
          "Dados base do jogo (OBB)",
          "Основные данные игры (OBB)",
          "Temel oyun verileri (OBB)"
        });
    TEXT.put(
        "Common resources",
        new String[] {
          "Common resources",
          "Gemeinsame Ressourcen",
          "Recursos comunes",
          "Recursos comunes",
          "Ressources communes",
          "Risorse comuni",
          "Wspólne zasoby",
          "Recursos comuns",
          "Общие ресурсы",
          "Ortak kaynaklar"
        });
    TEXT.put(
        "Language pack",
        new String[] {
          "Language pack",
          "Sprachpaket",
          "Paquete de idioma",
          "Paquete de idioma",
          "Pack de langue",
          "Pacchetto lingua",
          "Pakiet językowy",
          "Pacote de idioma",
          "Языковой пакет",
          "Dil paketi"
        });
    TEXT.put(
        "Installed",
        new String[] {
          "Installed",
          "Installiert",
          "Instalado",
          "Instalado",
          "Installé",
          "Installato",
          "Zainstalowano",
          "Instalado",
          "Установлено",
          "Yüklü"
        });
    TEXT.put(
        "Missing",
        new String[] {
          "Missing",
          "Fehlt",
          "Falta",
          "Falta",
          "Manquant",
          "Mancante",
          "Brak",
          "Ausente",
          "Отсутствует",
          "Eksik"
        });
    TEXT.put(
        "Ready to launch",
        new String[] {
          "Ready to launch",
          "Startbereit",
          "Listo para iniciar",
          "Listo para iniciar",
          "Prêt à lancer",
          "Pronto per avviare",
          "Gotowe do uruchomienia",
          "Pronto para iniciar",
          "Всё готово к запуску",
          "Başlatmaya hazır"
        });
    TEXT.put(
        "Connection code shown on your PC",
        new String[] {
          "Connection code shown on your PC",
          "Verbindungscode auf dem PC",
          "Código mostrado en el PC",
          "Código mostrado en la PC",
          "Code affiché sur le PC",
          "Codice mostrato sul PC",
          "Kod wyświetlony na komputerze",
          "Código mostrado no PC",
          "Код подключения с экрана ПК",
          "Bilgisayarda gösterilen bağlantı kodu"
        });
    TEXT.put(
        "Transfer incomplete",
        new String[] {
          "Transfer incomplete",
          "Übertragung unvollständig",
          "Transferencia incompleta",
          "Transferencia incompleta",
          "Transfert incomplet",
          "Trasferimento incompleto",
          "Transfer nieukończony",
          "Transferência incompleta",
          "Передача не завершена",
          "Aktarım tamamlanmadı"
        });
    TEXT.put(
        "Build",
        new String[] {
          "Build",
          "Erstellen",
          "Crear",
          "Crear",
          "Créer",
          "Crea",
          "Zbuduj",
          "Criar",
          "Собрать",
          "Oluştur"
        });
    TEXT.put(
        "Browse…",
        new String[] {
          "Browse…",
          "Durchsuchen…",
          "Examinar…",
          "Examinar…",
          "Parcourir…",
          "Sfoglia…",
          "Przeglądaj…",
          "Procurar…",
          "Выбрать…",
          "Gözat…"
        });
    TEXT.put(
        "PC game",
        new String[] {
          "PC game",
          "PC-Spiel",
          "Juego de PC",
          "Juego de PC",
          "Jeu PC",
          "Gioco PC",
          "Gra PC",
          "Jogo de PC",
          "ПК-игра",
          "PC oyunu"
        });
    TEXT.put(
        "Original XAPK",
        new String[] {
          "Original XAPK",
          "Original-XAPK",
          "XAPK original",
          "XAPK original",
          "XAPK original",
          "XAPK originale",
          "Oryginalny XAPK",
          "XAPK original",
          "Оригинальный XAPK",
          "Orijinal XAPK"
        });
    TEXT.put(
        "Output folder",
        new String[] {
          "Output folder",
          "Ausgabeordner",
          "Carpeta de salida",
          "Carpeta de salida",
          "Dossier de sortie",
          "Cartella di output",
          "Folder wynikowy",
          "Pasta de saída",
          "Папка результатов",
          "Çıktı klasörü"
        });
    TEXT.put(
        "Game languages to prepare",
        new String[] {
          "Game languages to prepare",
          "Vorzubereitende Spielsprachen",
          "Idiomas del juego que preparar",
          "Idiomas del juego que preparar",
          "Langues du jeu à préparer",
          "Lingue da preparare",
          "Języki gry do przygotowania",
          "Idiomas do jogo a preparar",
          "Языки игры для подготовки",
          "Hazırlanacak oyun dilleri"
        });
    TEXT.put(
        "Default game language:",
        new String[] {
          "Default game language:",
          "Standard-Spielssprache:",
          "Idioma predeterminado:",
          "Idioma predeterminado:",
          "Langue du jeu par défaut :",
          "Lingua predefinita:",
          "Domyślny język gry:",
          "Idioma padrão do jogo:",
          "Язык игры по умолчанию:",
          "Varsayılan oyun dili:"
        });
    TEXT.put(
        "Transfer game data to phone",
        new String[] {
          "Transfer game data to phone",
          "Spieldaten aufs Telefon übertragen",
          "Enviar datos al teléfono",
          "Enviar datos al teléfono",
          "Transférer les données au téléphone",
          "Trasferisci dati al telefono",
          "Prześlij dane na telefon",
          "Transferir dados para o telefone",
          "Передача данных игры на телефон",
          "Oyun verilerini telefona aktar"
        });
    TEXT.put(
        "Start transfer",
        new String[] {
          "Start transfer",
          "Übertragung starten",
          "Iniciar transferencia",
          "Iniciar transferencia",
          "Démarrer le transfert",
          "Avvia trasferimento",
          "Rozpocznij transfer",
          "Iniciar transferência",
          "Начать передачу",
          "Aktarımı başlat"
        });
    TEXT.put(
        "Stop",
        new String[] {
          "Stop",
          "Stoppen",
          "Detener",
          "Detener",
          "Arrêter",
          "Ferma",
          "Zatrzymaj",
          "Parar",
          "Остановить",
          "Durdur"
        });
    TEXT.put(
        "Open a previous build…",
        new String[] {
          "Open a previous build…",
          "Vorherigen Build öffnen…",
          "Abrir compilación anterior…",
          "Abrir compilación anterior…",
          "Ouvrir une compilation précédente…",
          "Apri build precedente…",
          "Otwórz poprzednią kompilację…",
          "Abrir compilação anterior…",
          "Открыть предыдущую сборку…",
          "Önceki derlemeyi aç…"
        });
    TEXT.put(
        "Advanced connection…",
        new String[] {
          "Advanced connection…",
          "Erweiterte Verbindung…",
          "Conexión avanzada…",
          "Conexión avanzada…",
          "Connexion avancée…",
          "Connessione avanzata…",
          "Zaawansowane połączenie…",
          "Conexão avançada…",
          "Дополнительные настройки связи…",
          "Gelişmiş bağlantı…"
        });
    TEXT.put(
        "Copy connection details",
        new String[] {
          "Copy connection details",
          "Verbindungsdaten kopieren",
          "Copiar conexión",
          "Copiar conexión",
          "Copier la connexion",
          "Copia connessione",
          "Kopiuj dane połączenia",
          "Copiar conexão",
          "Скопировать подключение",
          "Bağlantı bilgilerini kopyala"
        });
    TEXT.put(
        "Interface language",
        new String[] {
          "Interface language",
          "Oberflächensprache",
          "Idioma de la interfaz",
          "Idioma de la interfaz",
          "Langue de l’interface",
          "Lingua dell’interfaccia",
          "Język interfejsu",
          "Idioma da interface",
          "Язык интерфейса",
          "Arayüz dili"
        });
    TEXT.put(
        "Interface language:",
        new String[] {
          "Interface language:",
          "Oberflächensprache:",
          "Idioma de la interfaz:",
          "Idioma de la interfaz:",
          "Langue de l’interface:",
          "Lingua dell’interfaccia:",
          "Język interfejsu:",
          "Idioma da interface:",
          "Язык интерфейса:",
          "Arayüz dili:"
        });
    TEXT.put(
        "Import data ZIP",
        new String[] {
          "Import data ZIP",
          "Daten-ZIP importieren",
          "Importar ZIP de datos",
          "Importar ZIP de datos",
          "Importer le ZIP de données",
          "Importa ZIP dei dati",
          "Importuj ZIP z danymi",
          "Importar ZIP de dados",
          "Импортировать ZIP с данными",
          "Veri ZIP dosyasını içe aktar"
        });
    TEXT.put(
        "Small APK + data ZIP",
        new String[] {
          "Small APK + data ZIP",
          "Kleines APK + Daten-ZIP",
          "APK pequeño + ZIP de datos",
          "APK pequeño + ZIP de datos",
          "Petit APK + ZIP de données",
          "APK piccolo + ZIP dei dati",
          "Mały APK + ZIP z danymi",
          "APK pequeno + ZIP de dados",
          "Маленький APK + ZIP с данными",
          "Küçük APK + veri ZIP dosyası"
        });
    TEXT.put(
        "Offline XAPK",
        new String[] {
          "Offline XAPK",
          "Offline-XAPK",
          "XAPK sin conexión",
          "XAPK sin conexión",
          "XAPK hors ligne",
          "XAPK offline",
          "XAPK offline",
          "XAPK offline",
          "Автономный XAPK",
          "Çevrimdışı XAPK"
        });
    TEXT.put(
        "Use system language for the game",
        new String[] {
          "Use system language for the game",
          "Systemsprache für das Spiel verwenden",
          "Usar el idioma del sistema en el juego",
          "Usar el idioma del sistema en el juego",
          "Utiliser la langue du système pour le jeu",
          "Usa la lingua di sistema nel gioco",
          "Użyj języka systemu w grze",
          "Usar o idioma do sistema no jogo",
          "Установить в игре язык системы",
          "Oyunda sistem dilini kullan"
        });
    TEXT.put(
        "Scan QR code to download game data from your PC",
        new String[] {
          "Scan QR code to download game data from your PC",
          "QR-Code scannen, um Spieldaten vom PC zu laden",
          "Escanear QR para descargar datos del juego desde tu PC",
          "Escanear QR para descargar datos del juego desde tu PC",
          "Scanner le QR pour télécharger les données du jeu depuis le PC",
          "Scansiona il QR per scaricare i dati di gioco dal PC",
          "Zeskanuj QR, aby pobrać dane gry z komputera",
          "Ler QR para baixar dados do jogo do PC",
          "Сканировать QR для скачивания данных игры с ПК",
          "Oyun verilerini bilgisayardan indirmek için QR tara"
        });
    TEXT.put(
        "Download missing game data",
        new String[] {
          "Download missing game data",
          "Fehlende Spieldaten herunterladen",
          "Descargar datos del juego que faltan",
          "Descargar datos del juego que faltan",
          "Télécharger les données de jeu manquantes",
          "Scarica i dati di gioco mancanti",
          "Pobierz brakujące dane gry",
          "Baixar dados do jogo ausentes",
          "Скачать недостающие данные игры",
          "Eksik oyun verilerini indir"
        });
    TEXT.put(
        "QR code scanned. Choose your language, then tap Choose language packs and download.",
        new String[] {
          "QR code scanned. Choose your language, then tap Choose language packs and download.",
          "QR-Code gelesen. Wähle die Spielsprache und tippe auf Sprachpakete auswählen und"
              + " herunterladen.",
          "QR leído. Elige el idioma y pulsa Elegir y descargar paquetes de idiomas.",
          "QR leído. Elige el idioma y pulsa Elegir y descargar paquetes de idiomas.",
          "QR lu. Choisissez la langue, puis Choisir et télécharger les langues.",
          "QR letto. Scegli la lingua, poi Scegli e scarica pacchetti lingua.",
          "Kod QR odczytany. Wybierz język i dotknij Wybierz i pobierz pakiety językowe.",
          "QR lido. Escolha o idioma e toque em Escolher e baixar pacotes de idiomas.",
          "QR считан. Выберите язык игры, затем нажмите «Выбрать и скачать языковые пакеты».",
          "QR okundu. Oyun dilini seç, ardından Dil paketlerini seç ve indir."
        });
  }

  static String text(String code, String key) {
    String[] codes = {
      "en_us", "de_de", "es_es", "es_mx", "fr_fr", "it_it", "pl_pl", "pt_br", "ru_ru", "tr_tr"
    };
    String[] values = TEXT.get(key);
    if (values == null) return key;
    for (int i = 0; i < codes.length; i++) if (codes[i].equals(code)) return values[i];
    return values[0];
  }
}
