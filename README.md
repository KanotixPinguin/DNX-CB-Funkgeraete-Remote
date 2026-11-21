# DNX CB-Funkgeräte Remote (`v1.0.0`)

Drei voll bedienbare, markenfreie CB-Funkgeräte als schwebende Fernsteuerung direkt über dem OpenWebRX- / OpenWebRX+-Empfänger — **komplett mit allen hochauflösenden Frontplatten-Grafiken** in einem Paket.

## Inhalt des Pakets

- `install.sh` — interaktiver Installer für **normale OpenWebRX-Installationen** und **Docker-Images / Docker-Container**
- `files/dnx_george2.js` — komplettes JavaScript-Modul (ohne externe Abhängigkeiten)
- `files/funkgeraet1_ae8000.png` — Frontplatte Funkgerät 1 (Wurzelholz-Heimstation mit Doppel-Analog-Meter)
- `files/funkgeraet2_xf9082.png` — Frontplatte Funkgerät 2 (schwarze SSB-Heimstation mit Panorama-LCD)
- `files/funkgeraet3_111.png` — Frontplatte Funkgerät 3 (kompakte CB-Heimstation)
- `SHA256SUMS.txt` — Prüfsummen aller Dateien
- `LICENSE` — MIT-Lizenz

## Funktionen der drei CB-Funkgeräte

- **Volle SDR-Synchronisation:** Kanalwechsel (`1–80` nach deutscher CB-Frequenzzuteilung), Feinabstimmung (`RIT / Clarifier ±2,5 kHz`), Modulationsart (`FM / AM / USB / LSB`), Lautstärke (`VOL`), Rauschsperre (`SQ`), Rauschfilter (`ANL / NB / NR`) und Live-S-Meter im `100 ms`-Takt direkt auf den SDR-Pegel.
- **Funkgerät 1 (Wurzelholz):** Doppeltes Analog-Messwerk (`SIGNAL / TX POWER` & `MODULATION / SWR`), 5 wählbare Skalenbeleuchtungen, 17 LCD-Farben, 8 Gold-Drehknöpfe, `CH9/19`, `DW`, `ANL/NB`, `SCN/M·SCN`, `LCR`, `MON`, `FUN`, `ME`-Speicher.
- **Funkgerät 2 (SSB-Heimstation):** Gebogenes Analog-LCD-S-Meter + `BUSY`-Anzeige, Bernstein-Orange & Kobalt-Blau (+ 15 weitere Farben), `DIM/BRT`, `CH DIRECT & FUNCTION` (`1–9/*/0/#` für 2-stellige Direkteingabe & Speicher `M1–M10`), `PAGE`, `STEP` (`1`/`10`), `HI-CUT`, `ANL`, `ASC`, `DW`, `S.SKIP`, `LOCK`, `ANT 1/2`, `R.BEEP`, `DTMF`, `M.M`, `NB`, `SWR` sowie `MODE SELECTOR` und großes `VFO`-Rad.
- **Funkgerät 3 (Kompakt-Station):** 4-spaltige LED-Status-Matrix, Analog-S-Meter mit wählbarer Beleuchtung, rote 7-Segment-Kanalanzeige, `FM/AM`, `CH9`, `SCD` (`DW`), `RGR`, `NLD`, `TONE`.
- **Frei verschieb- & skalierbar:** Position, Größe, geöffnete Geräte und Kanal/Farbwahl werden je Browser in `localStorage` gemerkt. Wechsel jederzeit über `⇄ 1 / ⇄ 2 / ⇄ 3` oder gleichzeitiger Betrieb mehrerer Geräte.
- **Eigenständig ohne weitere Plugins:** Funktioniert auf jedem normalen OpenWebRX oder OpenWebRX+ (falls ein DNX-Styler oder `api/dnx-gain` vorhanden ist, werden diese automatisch genutzt; ohne Server-Gain-API arbeitet der RF-Gain-Regler sauber lokal ohne Fehlermeldungen).

---

## Installation

ZIP entpacken und den Installer starten:

```bash
unzip DNX-CB-Funkgeraete-Remote-v1.0.0.zip
cd DNX-CB-Funkgeraete-Remote
chmod +x install.sh
sudo ./install.sh
```

Der Installer **fragt dich zu Beginn automatisch**:

```
Welche OpenWebRX-Installation nutzt du?
  [1] Normales OpenWebRX / OpenWebRX+ (direkt auf dem System installiert)
  [2] Docker-Image / Docker-Container
```

- **Wahl `[1]` (Normales OpenWebRX):** Durchsucht automatisch die üblichen Pfade (`/usr/lib/python3/dist-packages/htdocs/plugins`, `/opt/openwebrx/...` usw.) nach dem `plugins`-Ordner oder übernimmt deinen eigenen Pfad.
- **Wahl `[2]` (Docker-Image / Docker-Container):** Listet deine Docker-Container auf und erkennt automatisch, ob der Container einen Host-Mount auf `htdocs/plugins` besitzt — falls **kein** Bind-Mount existiert, kopiert der Installer die Dateien per `docker cp` direkt in das Container-Dateisystem!

### Direkte Steuerung (optional ohne Rückfrage)

```bash
# Normales OpenWebRX:
sudo TYP=normal PLUGINS=/usr/lib/python3/dist-packages/htdocs/plugins ./install.sh install

# Docker-Container:
sudo TYP=docker CONTAINER=owrx-8011 ./install.sh install

# Ohne Neustart (danach im Browser Strg+F5 drücken):
sudo NORESTART=1 ./install.sh install
```

### Prüfen, Aktualisieren & Restlos Entfernen

```bash
./install.sh status
sudo ./install.sh update
sudo ./install.sh uninstall
```

Vor jeder Änderung an `receiver/init.js` wird automatisch eine Sicherung unter `/opt/dnx-cb-funk-backups/<Zeitstempel>/init.js` angelegt.

---

*Private, inoffizielle Hobby-Anpassung; kein offizielles OpenWebRX-/OpenWebRX+-Projekt. Nutzung auf eigene Gefahr.*
