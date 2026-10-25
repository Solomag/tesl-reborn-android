package org.teslreborn.setup;

import java.util.*;

/** UI translations; English is the default and fallback. */
final class UiStrings {
  private static final Map<String, String[]> TEXT = new HashMap<>();

  static {
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
        "Use phone language",
        new String[] {
          "Use phone language",
          "Telefonsprache verwenden",
          "Usar idioma del teléfono",
          "Usar idioma del teléfono",
          "Langue du téléphone",
          "Usa lingua del telefono",
          "Użyj języka telefonu",
          "Usar idioma do telefone",
          "Язык системы телефона",
          "Telefon dilini kullan"
        });
    TEXT.put(
        "Scan QR code",
        new String[] {
          "Scan QR code",
          "QR-Code scannen",
          "Escanear código QR",
          "Escanear código QR",
          "Scanner le code QR",
          "Scansiona codice QR",
          "Zeskanuj kod QR",
          "Ler código QR",
          "Сканировать QR-код",
          "QR kodunu tara"
        });
    TEXT.put(
        "Download missing game data and language",
        new String[] {
          "Download missing game data and language",
          "Fehlende Spieldaten und Sprache laden",
          "Descargar datos e idioma que faltan",
          "Descargar datos e idioma que faltan",
          "Télécharger les données et la langue manquantes",
          "Scarica dati e lingua mancanti",
          "Pobierz brakujące dane i język",
          "Baixar dados e idioma ausentes",
          "Скачать недостающие данные и язык",
          "Eksik oyun verilerini ve dili indir"
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
