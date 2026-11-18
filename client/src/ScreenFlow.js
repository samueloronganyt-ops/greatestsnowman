export const ScreenState = Object.freeze({
  TITLE: 'TITLE',
  LOGIN: 'LOGIN',
  MENU: 'MENU',
  LOBBY: 'LOBBY',
  GAME: 'GAME',
  QUIT_CONFIRM: 'QUIT_CONFIRM',
  THANKS: 'THANKS'
});

/** Explicit UI flow keeps login, lobby, gameplay, and quit transitions separate. */
export class ScreenFlow {
  constructor() {
    this.state = ScreenState.TITLE;
    this.returnState = null;
  }

  play(hasValidSession = false) {
    this.#expect(ScreenState.TITLE);
    this.state = hasValidSession ? ScreenState.MENU : ScreenState.LOGIN;
    return this.state;
  }

  loginSucceeded() {
    this.#expect(ScreenState.LOGIN, ScreenState.MENU);
    this.state = ScreenState.MENU;
    return this.state;
  }

  enterLobby() {
    this.#expect(ScreenState.MENU, ScreenState.LOBBY);
    this.state = ScreenState.LOBBY;
    return this.state;
  }

  enterGame() {
    this.#expect(ScreenState.LOBBY, ScreenState.GAME);
    this.state = ScreenState.GAME;
    return this.state;
  }

  roomLeft() {
    this.#expect(ScreenState.MENU, ScreenState.LOBBY, ScreenState.GAME);
    this.state = ScreenState.MENU;
    return this.state;
  }

  logout() {
    this.#expect(ScreenState.LOGIN, ScreenState.MENU, ScreenState.LOBBY, ScreenState.GAME);
    this.state = ScreenState.TITLE;
    return this.state;
  }

  requestQuit() {
    if (this.state === ScreenState.QUIT_CONFIRM || this.state === ScreenState.THANKS) return this.state;
    this.returnState = this.state;
    this.state = ScreenState.QUIT_CONFIRM;
    return this.state;
  }

  cancelQuit() {
    this.#expect(ScreenState.QUIT_CONFIRM);
    this.state = this.returnState || ScreenState.TITLE;
    this.returnState = null;
    return this.state;
  }

  confirmQuit() {
    this.#expect(ScreenState.QUIT_CONFIRM);
    this.state = ScreenState.THANKS;
    this.returnState = null;
    return this.state;
  }

  playAgain() {
    this.#expect(ScreenState.THANKS);
    this.state = ScreenState.TITLE;
    return this.state;
  }

  #expect(...states) {
    if (!states.includes(this.state)) {
      throw new Error(`Cannot transition from ${this.state}; expected ${states.join(' or ')}.`);
    }
  }
}
