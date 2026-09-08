# partymode Runbook

## Run a LAN party session

1. Put the laptop and all phones on the same Wi-Fi network.
2. From the repository root, run:

   ```sh
   npm install
   npm run build
   npm run lan
   npm run start
   ```

3. `npm run lan` prints one or more LAN URLs. Open the URL for the active Wi-Fi or Ethernet adapter
   on the host display, for example `http://192.168.1.23:8787`.
4. The host screen creates a room and displays a four-character room code plus a QR code.
5. Players scan the QR code or open `<lan-url>/join` and enter the room code and nickname.
6. When 3-8 players are in the lobby, the host presses **Start game**.
7. Play through three bluff-trivia rounds, then use **Play again** or **End room** on the host
   display.

## Development mode

Use separate dev servers while editing:

```sh
npm run dev:server
npm run dev:host -- --port 4300
npm run dev:player -- --port 4301
```

For separate dev-server ports, set `VITE_SERVER_URL=http://localhost:8787` when needed so the
clients connect to the server.

## Troubleshooting

- If phones cannot load the LAN URL, confirm they are on the same Wi-Fi network as the laptop.
- Guest networks and router client-isolation settings often block device-to-device traffic. v1
  cannot bypass that router setting.
- macOS or other firewalls may ask whether Node.js can accept incoming connections. Allow it for
  LAN play.
- If multiple LAN URLs print, try the Wi-Fi adapter first. Ethernet and VPN adapters may also
  appear.
- If the LAN IP changes during a session, start a new room using the new URL. v1 does not support
  reconnect after changing networks.
