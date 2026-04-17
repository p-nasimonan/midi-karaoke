const features: { tag: string; title: string; body: string }[] = [
  {
    tag: 'ピッチ検出',
    title: 'リアルタイムで音程を判定',
    body: 'マイクで拾った声を毎フレーム解析。ガイドバーに重なると青く光り、ズレると赤くなるので一目でわかります。',
  },
  {
    tag: 'MIDI再生',
    title: '楽器ごとに音を合成',
    body: 'GM規格のMIDIファイルに対応。ピアノ・ベース・ストリングスなど各パートを自動で判別して再生します。',
  },
  {
    tag: '採点機能',
    title: 'リアルタイムにスコア表示',
    body: 'ガイドと一致した時間をカウントして画面右上にスコアを表示。歌い終わったら何点だったか確認できます。',
  },
  {
    tag: 'キー変更',
    title: '自分の声域に合わせて調整',
    body: 'コントローラーの KEY ボタンで半音単位で上下に移調できます。高すぎる・低すぎる曲もラクに歌えます。',
  },
]

const steps: { step: string; text: string }[] = [
  { step: '1', text: '「OPEN」ボタン、またはファイルをドラッグ＆ドロップで .mid / .midi を読み込む' },
  { step: '2', text: '「PLAY」ボタンかスペースキーで再生スタート' },
  { step: '3', text: 'マイクに向かって歌う。歌声バーがガイドバーに重なれば正解！' },
  { step: '4', text: '「STOP」で止めてスコアを確認。次の曲も続けて読み込めます' },
]

const S = {
  section: {
    background: '#0d0d1a',
    borderTop: '1px solid rgba(255,255,255,0.07)',
    padding: '56px 24px 72px',
    color: 'rgba(220,220,240,0.75)',
  } satisfies React.CSSProperties,
  inner: {
    maxWidth: 800,
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 48,
  } satisfies React.CSSProperties,
  sectionLabel: {
    display: 'inline-block',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.2em',
    color: 'rgba(0,207,255,0.55)',
    textTransform: 'uppercase',
    marginBottom: 12,
  } satisfies React.CSSProperties,
}

export function InfoSection() {
  return (
    <section style={S.section}>
      <div style={S.inner}>

        {/* ── Hero ── */}
        <div>
          <p style={{
            fontSize: 13,
            lineHeight: 1.4,
            letterSpacing: '0.18em',
            color: 'rgba(0,207,255,0.5)',
            marginBottom: 8,
            fontFamily: 'var(--font-display)',
          }}>
            MIDI KARAOKE
          </p>
          <h2 style={{
            fontSize: 'clamp(22px, 4vw, 32px)',
            fontWeight: 900,
            lineHeight: 1.45,
            color: 'rgba(230,235,255,0.92)',
            marginBottom: 16,
            letterSpacing: '-0.01em',
          }}>
            MIDIファイルを開いて、<br />
            すぐ歌える。それだけ。
          </h2>
          <p style={{ fontSize: 14, lineHeight: 1.85, maxWidth: 520, color: 'rgba(200,205,225,0.65)' }}>
            インストール不要。アカウント登録なし。お手持ちのMIDIファイルをブラウザで開くだけで、リアルタイムにピッチ判定しながら歌えます。
          </p>
        </div>

        {/* ── Privacy guarantee ── */}
        <div style={{
          borderRadius: 16,
          padding: '28px 32px',
          background: 'linear-gradient(135deg, rgba(0,207,255,0.07) 0%, rgba(0,150,200,0.04) 100%)',
          border: '1.5px solid rgba(0,207,255,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.18em',
              color: '#0af',
              background: 'rgba(0,170,255,0.12)',
              border: '1px solid rgba(0,170,255,0.3)',
              borderRadius: 20,
              padding: '3px 10px',
            }}>
              安心・安全
            </span>
            <p style={{
              fontSize: 'clamp(16px, 2.5vw, 20px)',
              fontWeight: 900,
              color: 'rgba(230,240,255,0.95)',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
            }}>
              すべての処理はブラウザ内で完結します
            </p>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 10,
            marginTop: 4,
          }}>
            {[
              'MIDIファイルはサーバーへ送信しない',
              'マイク音声はブラウザ外に出ない',
              'オフラインでもそのまま動作',
            ].map(t => (
              <div key={t} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 13,
                lineHeight: 1.6,
                color: 'rgba(200,215,235,0.8)',
              }}>
                <span style={{ color: '#0af', flexShrink: 0, marginTop: 2, fontSize: 12 }}>✓</span>
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* ── Features ── */}
        <div>
          <p style={S.sectionLabel}>できること</p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 12,
          }}>
            {features.map(f => (
              <div key={f.tag} style={{
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.07)',
                background: 'rgba(255,255,255,0.025)',
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  color: 'rgba(0,207,255,0.6)',
                  background: 'rgba(0,207,255,0.08)',
                  borderRadius: 20,
                  padding: '2px 9px',
                  alignSelf: 'flex-start',
                }}>
                  {f.tag}
                </span>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'rgba(225,230,250,0.9)', lineHeight: 1.4 }}>
                  {f.title}
                </p>
                <p style={{ fontSize: 12, lineHeight: 1.75, color: 'rgba(190,200,220,0.65)' }}>
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ── How to use ── */}
        <div>
          <p style={S.sectionLabel}>使い方</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {steps.map((s, i) => (
              <div key={i} style={{
                display: 'flex',
                gap: 16,
                padding: '16px 0',
                borderBottom: i < steps.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                alignItems: 'flex-start',
              }}>
                <span style={{
                  flexShrink: 0,
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: 'rgba(0,207,255,0.12)',
                  border: '1px solid rgba(0,207,255,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 900,
                  color: 'rgba(0,207,255,0.8)',
                  letterSpacing: 0,
                  marginTop: 1,
                }}>
                  {s.step}
                </span>
                <span style={{ fontSize: 14, lineHeight: 1.75, color: 'rgba(210,215,235,0.8)', paddingTop: 4 }}>
                  {s.text}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer note ── */}
        <p style={{
          fontSize: 11,
          color: 'rgba(150,160,185,0.45)',
          lineHeight: 1.7,
          borderTop: '1px solid rgba(255,255,255,0.05)',
          paddingTop: 24,
        }}>
          対応ファイル: .mid / .midi &nbsp;|&nbsp; マイク使用: Web Audio API &nbsp;|&nbsp; ブラウザ推奨: Chrome / Edge / Firefox 最新版
        </p>

      </div>
    </section>
  )
}
