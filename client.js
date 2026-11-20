/**
 * dsh-ding — native notification and chime when a DeepSeek Harness task ends.
 *
 * Data source: `ctx.uiSession.sessionStatus`, the Client projection that already
 * follows Host `api-session/status` events for every session. A task ends when a
 * top-level session moves from running to idle. The Host half of this bundle is
 * inert; everything here runs in the browser client.
 *
 * Manual smoke test from the page console:
 *   document.dispatchEvent(new Event('dsh-ding:test'))
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-ding',
  factory(require) {
    const React = require('react')

    const NS = 'dsh-ding'
    const TEST_EVENT = 'dsh-ding:test'
    const TAG_PREFIX = 'dsh-ding:'

    const DICT = {
      en: {
        'notification.title': 'Task finished',
        'notification.untitled': 'DSH session',
        'test.title': 'Test alert',
        'test.body': 'Task completion alerts are working.'
      },
      zh: {
        'notification.title': '任务已结束',
        'notification.untitled': 'DSH 会话',
        'test.title': '测试提醒',
        'test.body': '任务完成提醒已生效。'
      }
    }

    /**
     * Lazily own one AudioContext and play a short two-tone chime.
     * Creation is deferred so a profile with no completions never opens an
     * audio device, and disposal closes the context when the plugin unloads.
     */
    function createChime() {
      let context
      let disposed = false

      const play = () => {
        try {
          if (disposed) return false
          const AudioContextCtor = window.AudioContext || window.webkitAudioContext
          if (AudioContextCtor === undefined) return false
          if (context === undefined) context = new AudioContextCtor()
          if (context.state === 'suspended') void context.resume()

          const start = context.currentTime + 0.01
          const tones = [
            { frequency: 1046.5, gain: 0.115, duration: 0.5 },
            { frequency: 1568, gain: 0.055, duration: 0.36 }
          ]
          for (const tone of tones) {
            const oscillator = context.createOscillator()
            const envelope = context.createGain()
            oscillator.type = 'sine'
            oscillator.frequency.value = tone.frequency
            envelope.gain.setValueAtTime(0.0001, start)
            envelope.gain.exponentialRampToValueAtTime(tone.gain, start + 0.012)
            envelope.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration)
            oscillator.connect(envelope)
            envelope.connect(context.destination)
            oscillator.start(start)
            oscillator.stop(start + tone.duration + 0.02)
            oscillator.onended = () => {
              try {
                oscillator.disconnect()
                envelope.disconnect()
              } catch {}
            }
          }
          return true
        } catch (error) {
          console.info('[dsh-ding] chime unavailable:', error)
          return false
        }
      }

      const dispose = () => {
        if (disposed) return
        disposed = true
        if (context === undefined) return
        const current = context
        context = undefined
        try {
          void current.close().catch(() => {})
        } catch {}
      }

      return { play, dispose }
    }

    /**
     * Bridge component: watch session running state and alert on true → false.
     * Renders nothing; it lives in the frame-wide overlay so it stays mounted
     * for as long as the application frame is.
     */
    function AlertBridge(props) {
      const status = props.useSessionStatus(snapshot => snapshot)
      const sessions = props.useSessions(snapshot => snapshot)
      const seen = React.useRef(new Map())
      const seeded = React.useRef(false)
      const latest = React.useRef({ sessions, notify: props.notify })
      latest.current.sessions = sessions
      latest.current.notify = props.notify

      React.useEffect(() => {
        const previous = seen.current
        const next = new Map()
        const finished = []
        for (const [id, info] of status) {
          const before = previous.get(id)
          const running = info.running
          next.set(id, running)
          if (before === true && running === false) finished.push(id)
        }
        seen.current = next
        if (!seeded.current) {
          // First observation is a baseline: never alert for work that ended
          // before this page (re)loaded.
          seeded.current = true
          return
        }
        for (const id of finished) {
          const row = latest.current.sessions.byId[id]
          if (row === undefined || row.origin === 'subagent') continue
          latest.current.notify(id, row.displayTitle, row)
        }
      }, [status])

      return null
    }

    return {
      inject: ['slots', 'locale', 'uiSession'],
      apply(ctx) {
        ctx.effect(() => {
          const disposeEn = ctx.locale.register(NS, 'en', DICT.en)
          const disposeZh = ctx.locale.register(NS, 'zh', DICT.zh)
          return () => {
            disposeEn()
            disposeZh()
          }
        }, 'dsh-ding: dictionaries')

        const translate = ctx.locale.bind(NS)
        const t = key => {
          let value
          try {
            value = translate(key)
          } catch {
            value = undefined
          }
          return value === undefined || value === key ? (DICT.en[key] ?? key) : value
        }

        const chime = createChime()
        ctx.effect(() => () => chime.dispose(), 'dsh-ding: chime')

        let warned = false
        const warnOnce = message => {
          if (warned) return
          warned = true
          console.info(`[dsh-ding] ${message}`)
        }

        const ensurePermission = () => {
          try {
            if (typeof Notification !== 'function') return
            if (Notification.permission !== 'default') return
            void Notification.requestPermission().catch(() => {})
          } catch (error) {
            console.info('[dsh-ding] notification permission unavailable:', error)
          }
        }

        const showNotification = (tag, title, body, onClick) => {
          try {
            if (typeof Notification !== 'function') {
              warnOnce('notifications are unavailable in this page')
              return false
            }
            if (Notification.permission !== 'granted') {
              if (Notification.permission === 'default') ensurePermission()
              warnOnce(
                Notification.permission === 'denied'
                  ? 'notifications are blocked for DeepSeek Harness; playing the chime only'
                  : 'notification permission is not granted; playing the chime only'
              )
              return false
            }
            const notification = new Notification(title, {
              body,
              tag: TAG_PREFIX + tag,
              silent: true
            })
            notification.onclick = () => {
              try {
                window.focus()
              } catch {}
              try {
                onClick()
              } catch (error) {
                console.info('[dsh-ding] opening the session failed:', error)
              }
            }
            return true
          } catch (error) {
            console.info('[dsh-ding] notification unavailable:', error)
            return false
          }
        }

        const openSession = id => {
          const workspace = ctx.get('uiWorkspace')
          if (workspace === undefined) return
          workspace.openSession(id)
        }

        /**
         * Skip the alert only when the user is already looking at that session
         * in a focused, visible window. A hidden-to-tray, minimized, or
         * background window still alerts.
         */
        const isWatching = row =>
          (row?.retainedBy?.mainView ?? 0) > 0 &&
          document.visibilityState === 'visible' &&
          document.hasFocus()

        const alertTask = (id, title) => {
          chime.play()
          showNotification(id, t('notification.title'), title, () => openSession(id))
        }

        const notify = (id, title, row) => {
          if (isWatching(row)) return
          alertTask(id, title || t('notification.untitled'))
        }

        const notifyTest = () => {
          chime.play()
          showNotification('test', t('test.title'), t('test.body'), () => {})
        }

        /*
         * Request permission on the first user gesture. Desktop grants it
         * without a prompt; a browser tab needs the gesture so the request is
         * not dropped or auto-blocked.
         */
        ctx.effect(() => {
          const listener = () => ensurePermission()
          document.addEventListener('pointerdown', listener, { capture: true, once: true })
          document.addEventListener('keydown', listener, { capture: true, once: true })
          return () => {
            document.removeEventListener('pointerdown', listener, { capture: true })
            document.removeEventListener('keydown', listener, { capture: true })
          }
        }, 'dsh-ding: notification permission gesture')

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'dsh-ding',
              inject: () => ({ notify })
            },
            AlertBridge
          )
        )

        ctx.effect(() => {
          const listener = () => notifyTest()
          document.addEventListener(TEST_EVENT, listener)
          return () => document.removeEventListener(TEST_EVENT, listener)
        }, 'dsh-ding: manual test hook')
      }
    }
  }
})
