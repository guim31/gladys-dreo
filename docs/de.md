# Dreo

Steuere deine **Dreo**-Ventilatoren, Heizgeräte, Luftreiniger und Luftbefeuchter über Gladys, über die
Dreo-Cloud — denselben Dienst, den die Dreo-App nutzt. Zustände kommen in Echtzeit an: Eine Stufe, die du an
der Fernbedienung oder in der App änderst, erscheint innerhalb einer Sekunde in Gladys.

> Diese Integration wurde **ohne die Hardware entwickelt**: Grundlage sind echte Antworten der Dreo-Cloud,
> die das Home-Assistant-Projekt `hass-dreo` veröffentlicht hat. Rückmeldungen sind willkommen, im Gladys-Forum
> oder in einem GitHub-Issue. Die Integration ist **nicht mit Dreo verbunden**.

## Überblick

| Dreo-Gerät                                              | Was du in Gladys bekommst                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Turmventilatoren (DR-HTF…)                              | Ein/Aus, Stufe, Modus, Oszillation, Raumtemperatur                                                        |
| Luftzirkulatoren / Standventilatoren (DR-HAF…, DR-HPF…) | Ein/Aus, Stufe, Modus, Oszillation (horizontal und vertikal), Raumtemperatur                              |
| Deckenventilatoren (DR-HCF…)                            | Ventilator Ein/Aus, Stufe, Modus (auch umgekehrt)                                                         |
| Heizgeräte (DR-HSH…, WH…)                               | Ein/Aus (siehe Sicherheit), Solltemperatur, Modus, Heizstufe, Raumtemperatur, Kindersicherung (nur lesen) |
| Luftreiniger (DR-HAP…)                                  | Ein/Aus, Stufe, Modus, PM2.5, Filterlebensdauer (wenn in % gemeldet)                                      |
| Luftbefeuchter (DR-HHM…)                                | Ein/Aus, Modus, Zielfeuchtigkeit, Nebelstufe, Luftfeuchtigkeit, Wassertank oder Wasserstand               |

Andere Dreo-Produkte (Klimageräte, Luftentfeuchter, Sprühnebelventilatoren, Kochgeräte) listet die Schaltfläche
„Geräte aktualisieren" als „noch nicht unterstützt" auf.

## Voraussetzungen

- Gladys Assistant 5.1.0 oder neuer.
- Ein Dreo-Konto, mit den in der Dreo-App eingerichteten Geräten (WLAN, Raum…).
- Internetzugang für Gladys: Alles läuft über die Dreo-Cloud.

## Konfiguration

1. In Gladys **Integrationen → Von GitHub installieren**, dann `https://github.com/guim31/gladys-dreo` eingeben.
2. Gib im Konfigurationsbildschirm die **E-Mail-Adresse** und das **Passwort** deines Dreo-Kontos ein.
3. **Kontoregion**: Europa oder Nordamerika. Liegst du falsch, wechselt die Integration selbst.
4. **Sprache der Funktionsnamen**: die Namen der Funktionen, wenn du ein Gerät hinzufügst (standardmäßig
   Französisch).
5. **Einschalten von Heizungen über Gladys erlauben**: standardmäßig aus, siehe unten.
6. Öffne den Tab **Erkennung** und füge die gewünschten Geräte hinzu.

Das Passwort dient nur zur Anmeldung; die Integration bewahrt das Sitzungstoken in ihrem privaten Volume `/data`
auf und meldet sich nur neu an, wenn Dreo es verlangt.

## Geräte

Ein/Aus ist ein normaler Schalter. Der **Modus** ist eine Liste der Modi, die dein Modell wirklich hat (normal,
natürlich, Schlaf, Auto, Turbo…). Die Stufen reichen von 1 bis zum Maximum deines Modells. Temperaturen werden in
Grad Celsius umgerechnet.

### Ventilatoren

Die **Oszillation** nutzt die Ventilator-Oszillationseinstellung von Gladys: _aus_ oder _links-rechts_ bei
Turmventilatoren, dazu _oben-unten_ und _beides_ bei neigbaren Luftzirkulatoren. Bei Deckenventilatoren mit
Leuchte schaltet das Einschalten des Ventilators nie die Leuchte ein.

### Heizgeräte

Zu deiner Sicherheit **kann ein Heizgerät nicht über Gladys eingeschaltet werden**, es sei denn, du aktivierst
„Einschalten von Heizungen über Gladys erlauben": Vielleicht ist niemand im Raum, um es zu beaufsichtigen.
**Ausschalten**, die **Solltemperatur** ändern und es überwachen funktionieren immer. Solange ein Heizgerät aus und
die Option deaktiviert ist, lassen sich auch Modus und Heizstufe nicht ändern (manche Modelle könnten starten, wenn
sie einen Modus erhalten). Die **Kindersicherung** wird angezeigt, nie gesteuert. Dreo-Heizgeräte folgen der
Solltemperatur im Modus **Eco**; im Modus **Heizen** folgen sie der Heizstufe (H1, H2…).

### Luftreiniger

PM2.5 wird in µg/m³ angegeben. Luftreiniger, die einen besonderen „Auto"-Befehl brauchen (`auto-regular`,
`auto-silent`), bekommen ihn automatisch. Die Filterlebensdauer erscheint bei den Modellen, die sie in Prozent
melden.

### Luftbefeuchter

Die Zielfeuchtigkeit (30 bis 90 %) ist die des aktuellen Modus (Auto oder Schlaf). Der Wassertank zeigt _Niedrig_,
wenn er leer ist; Modelle mit Füllstandsanzeige zeigen stattdessen den Stand in Prozent.

## Widget

Das Widget **Dreo-Geräte** zeigt alle zu Gladys hinzugefügten Dreo-Geräte auf einer Karte — an, aus oder offline,
mit Modus, Stufe und Temperatur — und eine Schaltfläche **Alle ausschalten** (mit Bestätigung). Füge es im Editor
des Dashboards hinzu.

## Szenen-Auslöser

**Dreo-Gerät online oder offline**: Ein Gerät hat die Verbindung zur Dreo-Cloud verloren (ausgesteckt, WLAN weg)
oder wiederhergestellt. Wähle ein Gerät und/oder die Änderung, oder lass sie leer. Variablen: der Gerätename und der
neue Zustand (`online` oder `offline`).

## Szenen-Aktion

**Dreo-Geräte ausschalten**: schaltet alle zu Gladys hinzugefügten Dreo-Geräte aus, die an sind, oder nur die
gewählten Arten (Ventilatoren, Heizgeräte, Luftreiniger, Luftbefeuchter). Ausgabe: die Zahl der ausgeschalteten
Geräte.

## Szenen-Beispiele

- **Haus verlassen**: Wenn die letzte Person geht, starte _Dreo-Geräte ausschalten_ mit der Art _Heizgeräte_ und
  schicke dir dann eine Nachricht mit der Zahl der ausgeschalteten Geräte.
- **Zu warm im Schlafzimmer**: Wenn die Schlafzimmertemperatur nach 22 Uhr über 26 °C steigt, schalte den
  Turmventilator im Modus _Schlaf_ auf Stufe 2 ein.
- **Heizung ausgesteckt**: Wenn die Heizung im Wohnzimmer offline geht, schicke eine Benachrichtigung.
- **Trockene Luft**: Wenn die vom Luftbefeuchter gemessene Feuchtigkeit unter 35 % fällt, setze seine
  Zielfeuchtigkeit auf 50 %.

## Wie die Zustände aktuell bleiben

Die Integration hält wie die App einen WebSocket zur Dreo-Cloud offen: Änderungen kommen sofort an. Alle 10 Minuten
liest sie zusätzlich den Zustand der zu Gladys hinzugefügten Geräte neu ein, falls ein Ereignis verloren ging, und
sendet einen unveränderten Wert alle 6 Stunden erneut, damit Gladys nie „Kein aktueller Wert" anzeigt. Dreo
veröffentlicht kein Kontingent für diese API: Die Integration bleibt weit unter dem, was die App tut (eine
Anmeldung, dann eine Anfrage pro Gerät alle 10 Minuten), und schickt Gladys nur geänderte Werte.

## Fehlerbehebung

- **„Dreo hat die E-Mail-Adresse oder das Passwort abgelehnt"**: Prüfe sie in der Dreo-App; die Integration versucht
  es nicht selbst erneut, um dein Konto nicht zu sperren. Speichere die Konfiguration erneut, um es neu zu versuchen.
- **„Die Dreo-Cloud ist nicht erreichbar"**: Prüfe den Internetzugang von Gladys; die Integration versucht es jede
  Minute erneut, dann immer seltener.
- **Ein Befehl scheitert mit „nicht bestätigt"**: Das Gerät ist vielleicht offline oder beschäftigt; prüfe es in der
  Dreo-App.
- **Ein Heizgerät reagiert nicht**: Dreo-Heizgeräte sperren die Fernsteuerung nach 24 Stunden ohne Benutzung
  (Sicherheitsregel); drücke die WLAN-Taste am Heizgerät.
- **Ein Gerät fehlt**: Drücke „Geräte aktualisieren" im Konfigurationsbildschirm und sieh dann im Tab Erkennung nach.
- Für Details setze die Umgebungsvariable `LOG_LEVEL=debug` und lies die Protokolle der Integration: Diese enthalten
  nie dein Passwort oder dein Token.

## Einschränkungen

- Ohne die Hardware entwickelt: Die Modelle sind die von `hass-dreo`, die Grenzen eines Modells, das in seinen
  Tabellen fehlt, sind geschätzt.
- Nur Cloud: keine lokale Steuerung, nichts funktioniert ohne Internet.
- Leuchten von Deckenventilatoren, Ambientebeleuchtung, Timer, Anzeige- und Toneinstellungen werden nicht angeboten.
- Klimageräte, Luftentfeuchter, Sprühnebelventilatoren und Kochgeräte werden noch nicht unterstützt.
- Dreo meldet Temperaturen in °F: Die Umrechnung rundet auf 0,1 °C, die Solltemperatur auf ganze Grad.
- Die API der Dreo-Cloud ist nicht öffentlich: Dreo kann sie ohne Vorwarnung ändern.
