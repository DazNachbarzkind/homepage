# Pong – gemeinsam spielen

Die Website ist eine statische Seite und kann über GitHub Pages gehostet werden. Firebase stellt nur die anonyme Anmeldung und die gemeinsame Echtzeit-Datenbank bereit.

> **GitHub Pages und Sichtbarkeit:** Bei GitHub Free muss das Repository für Pages öffentlich sein. Auch eine Pages-Website aus einem privaten Repository ist öffentlich im Internet erreichbar. Für Pages mit privatem Quell-Repository ist ein geeigneter kostenpflichtiger GitHub-Plan nötig.

## Einmalige Firebase-Einrichtung

1. Erstelle ein Projekt unter [Firebase Console](https://console.firebase.google.com/).
2. Füge eine Web-App hinzu und kopiere ihre Konfiguration in `firebase-config.js`.
3. Aktiviere unter **Authentication → Sign-in method** die Methode **Anonymous**.
4. Erstelle unter **Realtime Database** eine Datenbank und wähle beim Erstellen eine Region.
5. Übertrage die Regeln aus `database.rules.json` in den Realtime-Database-Reiter **Rules** und veröffentliche sie.
6. Trage die angezeigte Datenbank-URL als `databaseURL` in `firebase-config.js` ein.
7. Öffne im Repository **Settings → Pages** und wähle unter **Build and deployment → Source** die Option **GitHub Actions**.
8. Pushe die Änderungen nach `main`. GitHub Actions veröffentlicht die Seite über GitHub Pages.

Die Web-Konfiguration wird im Browser benötigt und ist kein Passwort. Die Datenbankregeln beschränken den Zugriff auf angemeldete anonyme Benutzer. Das Spiel speichert nur Namen, Paddle-Positionen und Spielstand; da es ein gemeinsamer öffentlicher Raum ist, können Spieler den Spielstand verändern.

## Spielregeln

- Der erste Besucher wählt einen Namen und wartet auf Mitspieler.
- Mit zwei Spielern beginnt klassisches Pong. Wer zuerst 7 Punkte erreicht, gewinnt.
- Sobald ein dritter Spieler beitritt, startet eine neue Runde im Dreiecksfeld. Jeder Spieler verteidigt eine Seite und hat drei Leben. Wer den Ball an der eigenen Seite vorbeilässt, verliert ein Leben; der letzte Spieler gewinnt.
- Es gibt keine KI in der Multiplayer-Lobby.
