import test from 'node:test';
import assert from 'node:assert/strict';
import { ScreenFlow, ScreenState } from '../src/ScreenFlow.js';

test('title opens login, then the room menu, lobby and game without re-showing title', () => {
  const flow = new ScreenFlow();
  assert.equal(flow.state, ScreenState.TITLE);
  assert.equal(flow.play(false), ScreenState.LOGIN);
  assert.equal(flow.loginSucceeded(), ScreenState.MENU);
  assert.equal(flow.enterLobby(), ScreenState.LOBBY);
  assert.equal(flow.enterGame(), ScreenState.GAME);
  assert.equal(flow.roomLeft(), ScreenState.MENU);
  assert.equal(flow.state, ScreenState.MENU);
});

test('a valid saved session skips login after Play', () => {
  const flow = new ScreenFlow();
  assert.equal(flow.play(true), ScreenState.MENU);
});

test('logout and Play Again return to the title screen', () => {
  const flow = new ScreenFlow();
  flow.play(false);
  flow.loginSucceeded();
  assert.equal(flow.logout(), ScreenState.TITLE);
  flow.requestQuit();
  assert.equal(flow.confirmQuit(), ScreenState.THANKS);
  assert.equal(flow.playAgain(), ScreenState.TITLE);
});

test('canceling Quit restores the screen it came from', () => {
  const flow = new ScreenFlow();
  flow.play(false);
  flow.requestQuit();
  assert.equal(flow.cancelQuit(), ScreenState.LOGIN);
});

test('invalid screen transitions are rejected', () => {
  const flow = new ScreenFlow();
  assert.throws(() => flow.enterGame(), /Cannot transition from TITLE/);
});
