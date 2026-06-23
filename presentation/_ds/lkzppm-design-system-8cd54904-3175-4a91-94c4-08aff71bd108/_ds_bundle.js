/* @ds-bundle: {"format":3,"namespace":"LkzppmDesignSystem_8cd549","components":[],"sourceHashes":{"ui_kits/portfolio/Hero.jsx":"a8b756f435e7","ui_kits/portfolio/Navigation.jsx":"76077b9806ad","ui_kits/portfolio/Sections.jsx":"748bd4c5005f","ui_kits/portfolio/components.jsx":"032390b5592a","ui_kits/portfolio/data.js":"74af1ea93e1a"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.LkzppmDesignSystem_8cd549 = window.LkzppmDesignSystem_8cd549 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// ui_kits/portfolio/Hero.jsx
try { (() => {
/* global React, Icon, ICONS, ClaudeBadge, ClaudeGlyph */
(function () {
  const {
    useState,
    useEffect,
    useRef
  } = React;
  const {
    Icon,
    ICONS,
    ClaudeBadge,
    ClaudeGlyph
  } = window;

  // ─── TitleBar ─────────────────────────────────────────────────────────
  function TitleBar({
    mode,
    onModeChange,
    showHint
  }) {
    const [hovered, setHovered] = useState(false);
    const [joke, setJoke] = useState(null);
    const timer = useRef(null);
    const JOKES = {
      close: 'nice try. i live here.',
      minimize: 'where would i even go?',
      expand: "i'm already full screen in your heart."
    };
    const triggerJoke = k => {
      if (timer.current) clearTimeout(timer.current);
      setJoke(JOKES[k]);
      timer.current = setTimeout(() => setJoke(null), 3000);
    };
    const ModeBtn = ({
      active,
      color,
      label,
      onClick
    }) => /*#__PURE__*/React.createElement("button", {
      role: "tab",
      "aria-selected": active,
      onClick: onClick,
      className: "lp-mode-btn",
      style: {
        color: active ? '#fff' : 'var(--fg-600)',
        background: active ? color + '33' : 'transparent',
        boxShadow: active ? `inset 0 0 0 1px ${color}66` : 'none'
      }
    }, label);
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-titlebar"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 16
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-traffic",
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false)
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => triggerJoke('close'),
      style: {
        background: '#ff5f57'
      },
      "aria-label": "Close"
    }, hovered && /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 10 10",
      width: "7",
      height: "7"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M2 2L8 8M8 2L2 8",
      stroke: "#7a1a15",
      strokeWidth: "1.5",
      strokeLinecap: "round"
    }))), /*#__PURE__*/React.createElement("button", {
      onClick: () => triggerJoke('minimize'),
      style: {
        background: '#febc2e'
      },
      "aria-label": "Minimize"
    }, hovered && /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 10 10",
      width: "7",
      height: "7"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M2 5H8",
      stroke: "#7a5500",
      strokeWidth: "1.5",
      strokeLinecap: "round"
    }))), /*#__PURE__*/React.createElement("button", {
      onClick: () => triggerJoke('expand'),
      style: {
        background: '#28c840'
      },
      "aria-label": "Full screen"
    }, hovered && /*#__PURE__*/React.createElement("svg", {
      viewBox: "0 0 10 10",
      width: "7",
      height: "7"
    }, /*#__PURE__*/React.createElement("path", {
      d: "M2 8L8 2M6 2H8V4M4 8H2V6",
      stroke: "#0a4a17",
      strokeWidth: "1.5",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      fill: "none"
    })))), /*#__PURE__*/React.createElement("span", {
      className: "lp-mono",
      style: {
        fontSize: 12,
        color: joke ? 'var(--fg-500)' : 'var(--fg-700)',
        fontStyle: joke ? 'italic' : 'normal',
        transition: 'color 0.2s'
      }
    }, joke || '~/portifolio')), /*#__PURE__*/React.createElement("div", {
      className: "lp-mode-toggle",
      role: "tablist",
      "aria-label": "Interface mode",
      style: {
        position: 'relative'
      }
    }, /*#__PURE__*/React.createElement(ModeBtn, {
      active: mode === 'terminal',
      color: "#0070f3",
      label: "terminal",
      onClick: () => onModeChange('terminal')
    }), /*#__PURE__*/React.createElement(ModeBtn, {
      active: mode === 'ai',
      color: "#c15f3c",
      label: "ai",
      onClick: () => onModeChange('ai')
    }), showHint && /*#__PURE__*/React.createElement("div", {
      className: "lp-hint",
      style: {
        right: mode === 'terminal' ? 4 : 60,
        color: mode === 'terminal' ? '#c15f3c' : '#0070f3',
        borderColor: (mode === 'terminal' ? '#c15f3c' : '#0070f3') + '55',
        background: (mode === 'terminal' ? '#c15f3c' : '#0070f3') + '1f'
      }
    }, "try me ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--fg-500)'
      }
    }, "\xB7"), ' ', /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--fg-400)'
      }
    }, "shift+tab"))));
  }

  // ─── Terminal body ────────────────────────────────────────────────────
  function TerminalBody({
    mode,
    onFirstMessage
  }) {
    const data = window.PortfolioData;
    const [history, setHistory] = useState([{
      kind: 'welcome'
    }]);
    const [input, setInput] = useState('');
    const [cmdHistory, setCmdHistory] = useState([]);
    const [hIdx, setHIdx] = useState(-1);
    const inputRef = useRef(null);
    const scrollRef = useRef(null);
    useEffect(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [history]);
    useEffect(() => {
      inputRef.current?.focus();
    }, [mode]);
    const exec = cmdRaw => {
      const cmd = cmdRaw.trim().toLowerCase();
      if (!cmd) return;
      onFirstMessage?.();
      setCmdHistory(h => [cmd, ...h].slice(0, 50));
      setHIdx(-1);
      const newEntries = [{
        kind: 'cmd',
        text: cmd
      }];
      if (cmd === 'clear') {
        setHistory([]);
        return;
      }
      newEntries.push({
        kind: 'output',
        cmd
      });
      setHistory(h => [...h, ...newEntries]);
    };
    const onKey = e => {
      if (e.key === 'Enter') {
        exec(input);
        setInput('');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const n = Math.min(hIdx + 1, cmdHistory.length - 1);
        if (n >= 0) {
          setHIdx(n);
          setInput(cmdHistory[n]);
        }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const n = Math.max(hIdx - 1, -1);
        setHIdx(n);
        setInput(n >= 0 ? cmdHistory[n] : '');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const matches = COMMANDS.filter(c => c.startsWith(input.trim().toLowerCase()));
        if (matches.length === 1) setInput(matches[0]);
      }
    };
    return /*#__PURE__*/React.createElement("div", {
      ref: scrollRef,
      className: "lp-terminal-body",
      onClick: () => inputRef.current?.focus()
    }, mode === 'terminal' ? /*#__PURE__*/React.createElement(React.Fragment, null, history.map((h, i) => {
      if (h.kind === 'welcome') return /*#__PURE__*/React.createElement(WelcomeBlock, {
        key: i,
        data: data,
        onCmd: c => exec(c)
      });
      if (h.kind === 'cmd') return /*#__PURE__*/React.createElement("div", {
        key: i,
        className: "lp-line"
      }, /*#__PURE__*/React.createElement("span", {
        className: "lp-prompt"
      }, "\u276F"), " ", /*#__PURE__*/React.createElement("span", null, h.text));
      if (h.kind === 'output') return /*#__PURE__*/React.createElement(OutputRouter, {
        key: i,
        cmd: h.cmd,
        data: data,
        onCmd: c => exec(c)
      });
      return null;
    }), /*#__PURE__*/React.createElement("div", {
      className: "lp-line lp-input-line"
    }, /*#__PURE__*/React.createElement("span", {
      className: "lp-prompt"
    }, "\u276F"), /*#__PURE__*/React.createElement("input", {
      ref: inputRef,
      className: "lp-input",
      value: input,
      onChange: e => setInput(e.target.value),
      onKeyDown: onKey,
      autoFocus: true,
      spellCheck: "false",
      autoComplete: "off"
    }))) : /*#__PURE__*/React.createElement(AiMode, {
      data: data,
      onFirstMessage: onFirstMessage
    }));
  }
  const COMMANDS = ['help', 'about', 'skills', 'projects', 'experience', 'education', 'contact', 'socials', 'resume', 'clear'];

  // ─── Welcome ─────────────────────────────────────────────────────────
  function WelcomeBlock({
    data,
    onCmd
  }) {
    const {
      personalInfo
    } = data;
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-welcome"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-line"
    }, /*#__PURE__*/React.createElement("span", {
      className: "lp-prompt"
    }, "\u276F"), " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--fg-500)'
      }
    }, "whoami")), /*#__PURE__*/React.createElement("h1", {
      className: "lp-hero-name"
    }, personalInfo.name), /*#__PURE__*/React.createElement("p", {
      className: "lp-hero-role"
    }, personalInfo.role, " \xB7 ", personalInfo.location), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 14
      }
    }, /*#__PURE__*/React.createElement(ClaudeBadge, null)), /*#__PURE__*/React.createElement("p", {
      className: "lp-hero-tagline"
    }, personalInfo.tagline), /*#__PURE__*/React.createElement("p", {
      className: "lp-hero-hint"
    }, "Type ", /*#__PURE__*/React.createElement("span", {
      className: "lp-mono",
      style: {
        color: 'var(--accent)'
      }
    }, "help"), " for commands, or click one below."), /*#__PURE__*/React.createElement("div", {
      className: "lp-cmd-grid"
    }, [{
      cmd: 'about',
      desc: 'Who I am'
    }, {
      cmd: 'projects',
      desc: 'What I built'
    }, {
      cmd: 'skills',
      desc: 'What I use'
    }, {
      cmd: 'contact',
      desc: 'Reach me'
    }].map(({
      cmd,
      desc
    }) => /*#__PURE__*/React.createElement("button", {
      key: cmd,
      className: "lp-cmd-card",
      onClick: () => onCmd(cmd)
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 13
      }
    }, cmd), /*#__PURE__*/React.createElement("p", {
      className: "lp-cmd-desc"
    }, desc)), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--fg-700)'
      }
    }, "\u203A")))));
  }

  // ─── Output blocks ───────────────────────────────────────────────────
  function OutputRouter({
    cmd,
    data,
    onCmd
  }) {
    switch (cmd) {
      case 'help':
        return /*#__PURE__*/React.createElement(HelpOutput, {
          onCmd: onCmd
        });
      case 'about':
        return /*#__PURE__*/React.createElement(AboutOutput, {
          data: data
        });
      case 'skills':
        return /*#__PURE__*/React.createElement(SkillsOutput, {
          data: data
        });
      case 'projects':
        return /*#__PURE__*/React.createElement(ProjectsOutput, {
          data: data
        });
      case 'experience':
        return /*#__PURE__*/React.createElement(ExperienceOutput, {
          data: data
        });
      case 'education':
        return /*#__PURE__*/React.createElement(EducationOutput, {
          data: data
        });
      case 'contact':
        return /*#__PURE__*/React.createElement(ContactOutput, {
          data: data
        });
      case 'socials':
        return /*#__PURE__*/React.createElement(SocialsOutput, {
          data: data
        });
      case 'resume':
        return /*#__PURE__*/React.createElement(ResumeOutput, null);
      default:
        return /*#__PURE__*/React.createElement("div", {
          className: "lp-line",
          style: {
            color: 'var(--fg-500)',
            paddingLeft: 18
          }
        }, "command not found: ", /*#__PURE__*/React.createElement("span", {
          className: "lp-mono"
        }, cmd), ". type ", /*#__PURE__*/React.createElement("span", {
          className: "lp-mono lp-accent"
        }, "help"), ".");
    }
  }
  function HelpOutput({
    onCmd
  }) {
    const items = [{
      cmd: 'about',
      desc: 'Who I am',
      icon: ICONS.user
    }, {
      cmd: 'skills',
      desc: 'What I use',
      icon: ICONS.wrench
    }, {
      cmd: 'projects',
      desc: 'What I built',
      icon: ICONS.folder
    }, {
      cmd: 'experience',
      desc: 'Where I worked',
      icon: ICONS.briefcase
    }, {
      cmd: 'education',
      desc: 'What I studied',
      icon: ICONS.grad
    }, {
      cmd: 'contact',
      desc: 'Reach me',
      icon: ICONS.envelope
    }, {
      cmd: 'socials',
      desc: 'Find me online',
      icon: ICONS.link
    }, {
      cmd: 'resume',
      desc: 'Get my CV',
      icon: ICONS.file
    }, {
      cmd: 'clear',
      desc: 'Reset',
      icon: ICONS.trash
    }];
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-output"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-output-title"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.bolt,
      viewBox: "0 0 448 512",
      size: 14,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("span", null, "Available commands")), /*#__PURE__*/React.createElement("div", {
      className: "lp-cmd-grid"
    }, items.map(({
      cmd,
      desc,
      icon
    }) => /*#__PURE__*/React.createElement("button", {
      key: cmd,
      className: "lp-cmd-card",
      onClick: () => onCmd(cmd)
    }, /*#__PURE__*/React.createElement(Icon, {
      d: icon,
      viewBox: "0 0 512 512",
      size: 14,
      color: "var(--fg-600)",
      style: {
        marginRight: 10
      }
    }), /*#__PURE__*/React.createElement("div", {
      style: {
        flex: 1,
        textAlign: 'left'
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 13
      }
    }, cmd), /*#__PURE__*/React.createElement("p", {
      className: "lp-cmd-desc"
    }, desc)), /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.chevron,
      viewBox: "0 0 448 512",
      size: 10,
      color: "var(--fg-700)"
    })))));
  }
  function AboutOutput({
    data
  }) {
    const {
      personalInfo
    } = data;
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-output"
    }, /*#__PURE__*/React.createElement("p", {
      className: "lp-output-lead"
    }, personalInfo.about.headline), /*#__PURE__*/React.createElement("p", {
      className: "lp-output-body"
    }, personalInfo.about.body), /*#__PURE__*/React.createElement("div", {
      className: "lp-output-stats"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono lp-accent"
    }, "Location"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--fg-200)'
      }
    }, personalInfo.location)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono lp-accent"
    }, "Education"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--fg-200)'
      }
    }, personalInfo.about.education)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono lp-accent"
    }, "Status"), /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#4ade80'
      }
    }, personalInfo.about.status))));
  }
  function SkillsOutput({
    data
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-output"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-output-title"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.wrench,
      viewBox: "0 0 512 512",
      size: 14,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("span", null, "Skills")), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '14px 24px',
        marginTop: 12
      }
    }, data.skillCategories.map(cat => /*#__PURE__*/React.createElement("div", {
      key: cat.title
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 12,
        marginBottom: 6
      }
    }, cat.title), /*#__PURE__*/React.createElement("div", {
      style: {
        color: 'var(--fg-300)',
        fontSize: 14,
        lineHeight: 1.8
      }
    }, cat.skills.join(' · '))))));
  }
  function ProjectsOutput({
    data
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-output"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-output-title"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.folder,
      viewBox: "0 0 512 512",
      size: 14,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("span", null, "Projects")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }
    }, data.projects.map(p => /*#__PURE__*/React.createElement("div", {
      key: p.id,
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontFamily: 'var(--font-display)',
        fontSize: 18,
        color: 'var(--fg-100)'
      }
    }, p.title), p.featured && /*#__PURE__*/React.createElement("span", {
      className: "lp-mono",
      style: {
        fontSize: 10,
        color: 'rgba(0,112,243,.7)'
      }
    }, "featured")), /*#__PURE__*/React.createElement("p", {
      className: "lp-output-body",
      style: {
        fontSize: 13
      }
    }, p.description), /*#__PURE__*/React.createElement("div", {
      className: "lp-chips"
    }, p.techStack.map(t => /*#__PURE__*/React.createElement("span", {
      key: t,
      className: "lp-chip"
    }, t)))))));
  }
  function ExperienceOutput({
    data
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-output"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-output-title"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.briefcase,
      viewBox: "0 0 512 512",
      size: 14,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("span", null, "Experience")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }
    }, data.experiences.map(x => /*#__PURE__*/React.createElement("div", {
      key: x.id
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 12
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono",
      style: {
        fontSize: 12,
        color: 'var(--fg-500)'
      }
    }, x.period), x.current && /*#__PURE__*/React.createElement("span", {
      style: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        background: '#4ade80',
        display: 'inline-block',
        animation: 'lp-pulse 2s ease-in-out infinite'
      }
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 4,
        fontFamily: 'var(--font-display)',
        fontSize: 16,
        color: 'var(--fg-100)'
      }
    }, x.title), /*#__PURE__*/React.createElement("div", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 12
      }
    }, x.organization), /*#__PURE__*/React.createElement("p", {
      className: "lp-output-body",
      style: {
        fontSize: 13,
        marginTop: 4
      }
    }, x.description)))));
  }
  function EducationOutput({
    data
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-output"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-output-title"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.grad,
      viewBox: "0 0 640 512",
      size: 14,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("span", null, "Education")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 10
      }
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontFamily: 'var(--font-display)',
        fontSize: 16,
        color: 'var(--fg-100)'
      }
    }, "Computer Engineering"), /*#__PURE__*/React.createElement("div", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 12
      }
    }, "UERJ \xB7 2022 \u2014 2027")), /*#__PURE__*/React.createElement("div", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 12,
        marginTop: 8
      }
    }, "Certifications"), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }
    }, data.certifications.map(c => /*#__PURE__*/React.createElement("div", {
      key: c.name,
      style: {
        fontSize: 13,
        color: 'var(--fg-400)'
      }
    }, c.name, " ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--fg-600)'
      }
    }, "\xB7 ", c.issuer))))));
  }
  function ContactOutput({
    data
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-output"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-output-title"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.envelope,
      viewBox: "0 0 512 512",
      size: 14,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("span", null, "Contact")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 10,
        fontSize: 14,
        color: 'var(--fg-300)'
      }
    }, "Reach me at ", /*#__PURE__*/React.createElement("a", {
      href: `mailto:${data.personalInfo.email}`,
      className: "lp-mono lp-accent",
      style: {
        textDecoration: 'underline'
      }
    }, data.personalInfo.email), ' ', "\u2014 or scroll down to the ", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--fg-100)'
      }
    }, "Contact"), " section for the form."));
  }
  function SocialsOutput({
    data
  }) {
    const {
      personalInfo
    } = data;
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-output"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-output-title"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.link,
      viewBox: "0 0 640 512",
      size: 14,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("span", null, "Socials")), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement("a", {
      href: personalInfo.github,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: 'var(--fg-100)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.github,
      viewBox: "0 0 496 512",
      size: 14
    }), " ", personalInfo.githubHandle), /*#__PURE__*/React.createElement("a", {
      href: personalInfo.linkedin,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: 'var(--fg-100)'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.linkedin,
      viewBox: "0 0 448 512",
      size: 14
    }), " ", personalInfo.linkedinHandle)));
  }
  function ResumeOutput() {
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-output"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-output-title"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.file,
      viewBox: "0 0 384 512",
      size: 14,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("span", null, "Resume")), /*#__PURE__*/React.createElement("p", {
      className: "lp-output-body",
      style: {
        marginTop: 8,
        fontSize: 14
      }
    }, /*#__PURE__*/React.createElement("a", {
      href: "#",
      className: "lp-mono lp-accent",
      style: {
        textDecoration: 'underline'
      }
    }, "CV Lucas Pacheco.pdf"), " \u2014 download or open in a new tab."));
  }

  // ─── AI mode ─────────────────────────────────────────────────────────
  function AiMode({
    data,
    onFirstMessage
  }) {
    const [messages, setMessages] = useState([{
      role: 'assistant',
      content: "Hey — I'm an AI version of Lucas. Ask me anything about his work, stack, or projects."
    }]);
    const [input, setInput] = useState('');
    const inputRef = useRef(null);
    useEffect(() => {
      inputRef.current?.focus();
    }, []);
    const send = async () => {
      const q = input.trim();
      if (!q) return;
      onFirstMessage?.();
      setMessages(m => [...m, {
        role: 'user',
        content: q
      }]);
      setInput('');
      setTimeout(() => {
        setMessages(m => [...m, {
          role: 'assistant',
          content: "I'd answer that against Lucas's portfolio data — but in this UI-kit demo the chat is stubbed. Try the terminal mode commands for the real content."
        }]);
      }, 600);
    };
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-ai"
    }, messages.map((m, i) => /*#__PURE__*/React.createElement("div", {
      key: i,
      className: `lp-msg lp-msg-${m.role}`
    }, m.role === 'assistant' && /*#__PURE__*/React.createElement("div", {
      className: "lp-msg-avatar"
    }, /*#__PURE__*/React.createElement(ClaudeGlyph, null)), /*#__PURE__*/React.createElement("div", {
      className: "lp-msg-bubble"
    }, m.content))), /*#__PURE__*/React.createElement("div", {
      className: "lp-ai-input-row"
    }, /*#__PURE__*/React.createElement("input", {
      ref: inputRef,
      value: input,
      onChange: e => setInput(e.target.value),
      onKeyDown: e => e.key === 'Enter' && send(),
      placeholder: "Ask about Lucas's work\u2026",
      className: "lp-ai-input"
    }), /*#__PURE__*/React.createElement("button", {
      onClick: send,
      className: "lp-ai-send",
      "aria-label": "Send"
    }, "\u2192")));
  }

  // ─── Hero (Terminal-as-Hero) ─────────────────────────────────────────
  function Hero() {
    const [mode, setMode] = useState('terminal');
    const [hintDismissed, setHintDismissed] = useState(false);
    useEffect(() => {
      const onKey = e => {
        if (!(e.key === 'Tab' && e.shiftKey)) return;
        e.preventDefault();
        setMode(m => m === 'terminal' ? 'ai' : 'terminal');
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);
    return /*#__PURE__*/React.createElement("section", {
      id: "hero",
      className: "lp-hero"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-hero-bg"
    }, /*#__PURE__*/React.createElement("div", {
      className: `lp-aurora ${mode === 'terminal' ? 'lp-aurora-blue' : 'lp-aurora-orange'}`
    }), /*#__PURE__*/React.createElement("div", {
      className: `lp-aurora ${mode === 'terminal' ? 'lp-aurora-cyan' : 'lp-aurora-amber'}`
    }), /*#__PURE__*/React.createElement("div", {
      className: mode === 'terminal' ? 'lp-texture-dots' : 'lp-texture-grid'
    }), /*#__PURE__*/React.createElement("div", {
      className: "lp-scanlines"
    })), /*#__PURE__*/React.createElement("div", {
      style: {
        height: 64,
        flexShrink: 0
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "lp-hero-inner"
    }, /*#__PURE__*/React.createElement(TitleBar, {
      mode: mode,
      onModeChange: setMode,
      showHint: !hintDismissed
    }), /*#__PURE__*/React.createElement(TerminalBody, {
      mode: mode,
      onFirstMessage: () => setHintDismissed(true)
    })));
  }
  window.Hero = Hero;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/portfolio/Hero.jsx", error: String((e && e.message) || e) }); }

// ui_kits/portfolio/Navigation.jsx
try { (() => {
/* global React, Reveal */
(function () {
  const {
    useState,
    useEffect
  } = React;
  function Navigation() {
    const [scrolled, setScrolled] = useState(false);
    const [open, setOpen] = useState(false);
    const [active, setActive] = useState('hero');
    useEffect(() => {
      const onScroll = () => setScrolled(window.scrollY > 50);
      onScroll();
      window.addEventListener('scroll', onScroll, {
        passive: true
      });
      return () => window.removeEventListener('scroll', onScroll);
    }, []);
    useEffect(() => {
      const targets = ['hero', 'about', 'projects', 'skills', 'experience', 'contact'];
      const obs = new IntersectionObserver(entries => entries.forEach(e => {
        if (e.isIntersecting) setActive(e.target.id);
      }), {
        rootMargin: '-50% 0px -50% 0px'
      });
      targets.forEach(id => {
        const el = document.getElementById(id);
        if (el) obs.observe(el);
      });
      return () => obs.disconnect();
    }, []);
    const navLinks = [{
      name: 'About',
      href: '#about'
    }, {
      name: 'Projects',
      href: '#projects'
    }, {
      name: 'Skills',
      href: '#skills'
    }, {
      name: 'Experience',
      href: '#experience'
    }, {
      name: 'Contact',
      href: '#contact'
    }];
    const onClick = (e, href) => {
      e.preventDefault();
      setOpen(false);
      const el = document.querySelector(href);
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - 64;
      window.scrollTo({
        top: Math.max(0, top),
        behavior: 'smooth'
      });
    };
    return /*#__PURE__*/React.createElement("header", {
      className: "lp-nav",
      style: {
        background: scrolled ? 'rgba(0,0,0,0.9)' : 'transparent',
        backdropFilter: scrolled ? 'blur(4px)' : 'none',
        borderBottomColor: scrolled ? 'var(--fg-800)' : 'transparent'
      }
    }, /*#__PURE__*/React.createElement("nav", {
      className: "lp-nav-inner"
    }, /*#__PURE__*/React.createElement("a", {
      href: "#hero",
      onClick: e => {
        e.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: 'smooth'
        });
      },
      className: "lp-wordmark",
      style: {
        color: active === 'hero' ? '#fff' : 'var(--fg-100)'
      }
    }, "LP", /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--accent)'
      }
    }, "."), active === 'hero' && /*#__PURE__*/React.createElement("span", {
      className: "lp-nav-underline"
    })), /*#__PURE__*/React.createElement("div", {
      className: "lp-nav-links"
    }, navLinks.map(l => {
      const isActive = active === l.name.toLowerCase();
      return /*#__PURE__*/React.createElement("a", {
        key: l.name,
        href: l.href,
        onClick: e => onClick(e, l.href),
        className: "lp-nav-link",
        style: {
          color: isActive ? '#fff' : 'var(--fg-500)',
          position: 'relative'
        }
      }, l.name, isActive && /*#__PURE__*/React.createElement("span", {
        className: "lp-nav-underline"
      }));
    })), /*#__PURE__*/React.createElement("button", {
      onClick: () => setOpen(!open),
      className: "lp-nav-menu-btn",
      "aria-label": open ? 'Close menu' : 'Open menu'
    }, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono"
    }, open ? '×' : '☰'))), open && /*#__PURE__*/React.createElement("div", {
      className: "lp-mobile-menu"
    }, navLinks.map((l, i) => /*#__PURE__*/React.createElement("a", {
      key: l.name,
      href: l.href,
      onClick: e => onClick(e, l.href)
    }, /*#__PURE__*/React.createElement("span", null, l.name), /*#__PURE__*/React.createElement("span", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 13
      }
    }, "0", i + 1)))));
  }
  window.Navigation = Navigation;
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/portfolio/Navigation.jsx", error: String((e && e.message) || e) }); }

// ui_kits/portfolio/Sections.jsx
try { (() => {
/* global React, Reveal, SectionLabel, AnimatedTitle, Icon, ICONS, TechChip */
(function () {
  const {
    useState
  } = React;
  const {
    Reveal,
    SectionLabel,
    AnimatedTitle,
    Icon,
    ICONS,
    TechChip
  } = window;
  function About() {
    const {
      personalInfo
    } = window.PortfolioData;
    const HIGHLIGHT = 'production AI systems that ship';
    const [pre, post] = personalInfo.about.headline.split(HIGHLIGHT);
    const stats = [{
      label: 'Location',
      value: personalInfo.location
    }, {
      label: 'Education',
      value: personalInfo.about.education
    }, {
      label: 'Status',
      value: personalInfo.about.status,
      accent: '#4ade80'
    }];
    return /*#__PURE__*/React.createElement("section", {
      id: "about",
      className: "lp-section"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-12col",
      style: {
        minHeight: '60vh'
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-col-4 lp-cell lp-cell-r lp-cell-center"
    }, /*#__PURE__*/React.createElement(Reveal, {
      x: -48
    }, /*#__PURE__*/React.createElement(SectionLabel, {
      num: "01",
      text: "About",
      stacked: true
    }))), /*#__PURE__*/React.createElement("div", {
      className: "lp-col-8 lp-cell lp-cell-center"
    }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement("p", {
      className: "lp-lead"
    }, pre, /*#__PURE__*/React.createElement("span", {
      style: {
        color: '#fff'
      }
    }, HIGHLIGHT), post)), /*#__PURE__*/React.createElement(Reveal, {
      delay: 120
    }, /*#__PURE__*/React.createElement("p", {
      className: "lp-body lp-body-muted",
      style: {
        marginTop: 24,
        maxWidth: '60ch'
      }
    }, personalInfo.about.body)), /*#__PURE__*/React.createElement("div", {
      className: "lp-stats"
    }, stats.map((s, i) => /*#__PURE__*/React.createElement(Reveal, {
      key: s.label,
      delay: 300 + i * 100,
      y: 20
    }, /*#__PURE__*/React.createElement("p", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 13
      }
    }, s.label), /*#__PURE__*/React.createElement("p", {
      style: {
        marginTop: 4,
        color: s.accent || 'var(--fg-200)'
      }
    }, s.value)))))));
  }
  function Projects() {
    const {
      projects
    } = window.PortfolioData;
    const [selected, setSelected] = useState(null);
    return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("section", {
      id: "projects",
      className: "lp-section"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-section-header"
    }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(SectionLabel, {
      num: "02",
      text: "Projects"
    }))), /*#__PURE__*/React.createElement("div", null, projects.map((p, idx) => /*#__PURE__*/React.createElement(Reveal, {
      key: p.id,
      amount: 0.2
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-project-row",
      onClick: () => setSelected(p)
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-project-num lp-mono"
    }, "0", idx + 1), /*#__PURE__*/React.createElement("div", {
      className: "lp-project-thumb"
    }, /*#__PURE__*/React.createElement("img", {
      src: p.image,
      alt: p.title
    })), /*#__PURE__*/React.createElement("div", {
      className: "lp-project-text"
    }, /*#__PURE__*/React.createElement("h3", {
      className: "lp-project-title"
    }, p.title), p.featured && /*#__PURE__*/React.createElement("span", {
      className: "lp-mono",
      style: {
        fontSize: 11,
        color: 'rgba(0,112,243,.7)'
      }
    }, "featured")), /*#__PURE__*/React.createElement("div", {
      className: "lp-project-desc"
    }, /*#__PURE__*/React.createElement("p", null, p.description), /*#__PURE__*/React.createElement("div", {
      className: "lp-chips"
    }, p.techStack.map(t => /*#__PURE__*/React.createElement(TechChip, {
      key: t
    }, t)))), /*#__PURE__*/React.createElement("div", {
      className: "lp-project-arrow"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.external,
      viewBox: "0 0 512 512",
      size: 14
    }))))))), selected && /*#__PURE__*/React.createElement(ProjectModal, {
      project: selected,
      onClose: () => setSelected(null)
    }));
  }
  function ProjectModal({
    project,
    onClose
  }) {
    return /*#__PURE__*/React.createElement("div", {
      className: "lp-modal-scrim",
      onClick: onClose
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-modal",
      onClick: e => e.stopPropagation()
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-modal-image"
    }, /*#__PURE__*/React.createElement("img", {
      src: project.image,
      alt: project.title
    })), /*#__PURE__*/React.createElement("div", {
      className: "lp-modal-body"
    }, /*#__PURE__*/React.createElement("h3", {
      className: "lp-h3",
      style: {
        marginBottom: 8
      }
    }, project.title), /*#__PURE__*/React.createElement("p", {
      className: "lp-body lp-body-muted"
    }, project.description), /*#__PURE__*/React.createElement("div", {
      className: "lp-chips",
      style: {
        marginTop: 12
      }
    }, project.techStack.map(t => /*#__PURE__*/React.createElement(TechChip, {
      key: t
    }, t)))), /*#__PURE__*/React.createElement("button", {
      className: "lp-modal-close",
      onClick: onClose,
      "aria-label": "Close"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.xmark,
      viewBox: "0 0 384 512",
      size: 14
    }))));
  }
  function Skills() {
    const {
      skillCategories
    } = window.PortfolioData;
    return /*#__PURE__*/React.createElement("section", {
      id: "skills",
      className: "lp-section"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-12col"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-col-4 lp-cell lp-cell-r"
    }, /*#__PURE__*/React.createElement(Reveal, {
      x: -48
    }, /*#__PURE__*/React.createElement(SectionLabel, {
      num: "03",
      text: "Skills",
      stacked: true
    }))), /*#__PURE__*/React.createElement("div", {
      className: "lp-col-8",
      style: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr'
      }
    }, skillCategories.map((cat, i) => /*#__PURE__*/React.createElement(Reveal, {
      key: cat.title,
      delay: i * 120,
      style: {
        padding: '32px 40px',
        borderBottom: '1px solid var(--fg-800)',
        borderRight: i % 2 === 0 ? '1px solid var(--fg-800)' : 'none'
      }
    }, /*#__PURE__*/React.createElement("h3", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 13,
        marginBottom: 18
      }
    }, cat.title), /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }
    }, cat.skills.map(s => /*#__PURE__*/React.createElement("p", {
      key: s,
      style: {
        color: 'var(--fg-300)',
        fontSize: 18
      }
    }, s))))))));
  }
  function Experience() {
    const {
      experiences
    } = window.PortfolioData;
    return /*#__PURE__*/React.createElement("section", {
      id: "experience",
      className: "lp-section"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-section-header"
    }, /*#__PURE__*/React.createElement(Reveal, null, /*#__PURE__*/React.createElement(SectionLabel, {
      num: "04",
      text: "Experience"
    }))), /*#__PURE__*/React.createElement("div", null, experiences.map((x, i) => /*#__PURE__*/React.createElement(Reveal, {
      key: x.id,
      x: -40,
      delay: i * 150,
      amount: 0.3
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-exp-row"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-exp-period"
    }, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono",
      style: {
        color: 'var(--fg-500)',
        fontSize: 13
      }
    }, x.period), x.current && /*#__PURE__*/React.createElement("span", {
      className: "lp-dot-pulse"
    })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
      className: "lp-exp-title"
    }, x.title), /*#__PURE__*/React.createElement("p", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 13,
        marginTop: 4
      }
    }, x.organization)), /*#__PURE__*/React.createElement("p", {
      className: "lp-exp-desc"
    }, x.description))))));
  }
  function Contact() {
    const {
      personalInfo
    } = window.PortfolioData;
    const [sent, setSent] = useState(false);
    return /*#__PURE__*/React.createElement("section", {
      id: "contact",
      className: "lp-section"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-12col"
    }, /*#__PURE__*/React.createElement("div", {
      className: "lp-col-5 lp-cell lp-cell-r"
    }, /*#__PURE__*/React.createElement(Reveal, {
      x: -48
    }, /*#__PURE__*/React.createElement(SectionLabel, {
      num: "05",
      text: "Get in touch",
      stacked: true
    }), /*#__PURE__*/React.createElement("p", {
      className: "lp-body lp-body-muted",
      style: {
        marginTop: 24,
        maxWidth: '40ch'
      }
    }, "Reach me at ", /*#__PURE__*/React.createElement("a", {
      href: `mailto:${personalInfo.email}`,
      className: "lp-mono lp-accent"
    }, personalInfo.email), ", or send a message directly."), /*#__PURE__*/React.createElement("div", {
      style: {
        marginTop: 24,
        display: 'flex',
        gap: 16,
        flexWrap: 'wrap'
      }
    }, /*#__PURE__*/React.createElement("a", {
      href: personalInfo.github,
      className: "lp-social"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.github,
      viewBox: "0 0 496 512",
      size: 14
    }), /*#__PURE__*/React.createElement("span", null, personalInfo.githubHandle)), /*#__PURE__*/React.createElement("a", {
      href: personalInfo.linkedin,
      className: "lp-social"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.linkedin,
      viewBox: "0 0 448 512",
      size: 14
    }), /*#__PURE__*/React.createElement("span", null, personalInfo.linkedinHandle))))), /*#__PURE__*/React.createElement("div", {
      className: "lp-col-7 lp-cell"
    }, /*#__PURE__*/React.createElement(Reveal, null, sent ? /*#__PURE__*/React.createElement("div", {
      className: "lp-form-sent"
    }, /*#__PURE__*/React.createElement(Icon, {
      d: ICONS.bolt,
      viewBox: "0 0 448 512",
      size: 18,
      color: "var(--accent)"
    }), /*#__PURE__*/React.createElement("h3", {
      className: "lp-h3",
      style: {
        marginTop: 12
      }
    }, "Message sent."), /*#__PURE__*/React.createElement("p", {
      className: "lp-body lp-body-muted",
      style: {
        marginTop: 4
      }
    }, "I'll reply within a day or two.")) : /*#__PURE__*/React.createElement("form", {
      className: "lp-form",
      onSubmit: e => {
        e.preventDefault();
        setSent(true);
      }
    }, /*#__PURE__*/React.createElement("label", null, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 12
      }
    }, "Name"), /*#__PURE__*/React.createElement("input", {
      type: "text",
      placeholder: "Your name",
      required: true
    })), /*#__PURE__*/React.createElement("label", null, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 12
      }
    }, "Email"), /*#__PURE__*/React.createElement("input", {
      type: "email",
      placeholder: "you@domain.com",
      required: true
    })), /*#__PURE__*/React.createElement("label", null, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 12
      }
    }, "Message"), /*#__PURE__*/React.createElement("textarea", {
      rows: "4",
      placeholder: "What are you building?",
      required: true
    })), /*#__PURE__*/React.createElement("button", {
      className: "lp-btn lp-btn-primary",
      type: "submit"
    }, "Send message"))))));
  }
  Object.assign(window, {
    About,
    Projects,
    Skills,
    Experience,
    Contact,
    ProjectModal
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/portfolio/Sections.jsx", error: String((e && e.message) || e) }); }

// ui_kits/portfolio/components.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/* global React */
// ─── Shared bits ──────────────────────────────────────────────────────
(function () {
  const {
    useState,
    useEffect,
    useRef,
    useCallback
  } = React;

  // AnimatedTitle — letter-by-letter slide-in. Used in section headers.
  function AnimatedTitle({
    text,
    className = ''
  }) {
    const str = String(text ?? '');
    const letters = str.split('');
    return /*#__PURE__*/React.createElement("span", {
      className: className,
      "aria-label": str
    }, letters.map((ch, i) => /*#__PURE__*/React.createElement("span", {
      key: i,
      "aria-hidden": "true",
      style: {
        display: 'inline-block',
        opacity: 0,
        transform: 'translateY(40%)',
        animation: `lp-letter-in 0.7s cubic-bezier(0.16, 1, 0.3, 1) ${i * 0.05}s forwards`
      }
    }, ch === ' ' ? '\u00A0' : ch)));
  }

  // SectionLabel — mono number + tagged.
  function SectionLabel({
    num,
    text,
    children,
    stacked
  }) {
    const title = text ?? (typeof children === 'string' ? children : '');
    if (stacked) {
      return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
        className: "lp-mono lp-accent",
        style: {
          fontSize: 14
        }
      }, num), /*#__PURE__*/React.createElement("h2", {
        className: "lp-h2",
        style: {
          marginTop: 8
        }
      }, /*#__PURE__*/React.createElement(AnimatedTitle, {
        text: title
      })));
    }
    return /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 18
      }
    }, /*#__PURE__*/React.createElement("span", {
      className: "lp-mono lp-accent",
      style: {
        fontSize: 14
      }
    }, num), /*#__PURE__*/React.createElement("h2", {
      className: "lp-h2"
    }, /*#__PURE__*/React.createElement(AnimatedTitle, {
      text: title
    })));
  }

  // Reveal — fades + slides element into view when scrolled.
  function Reveal({
    children,
    delay = 0,
    y = 50,
    x = 0,
    amount = 0.3,
    as: Tag = 'div',
    style,
    ...rest
  }) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
      const el = ref.current;
      if (!el) return;
      const obs = new IntersectionObserver(entries => {
        entries.forEach(e => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        });
      }, {
        threshold: amount
      });
      obs.observe(el);
      return () => obs.disconnect();
    }, [amount]);
    return /*#__PURE__*/React.createElement(Tag, _extends({
      ref: ref,
      style: {
        opacity: visible ? 1 : 0,
        transform: visible ? 'none' : `translate(${x}px, ${y}px)`,
        transition: `opacity 850ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 850ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        ...style
      }
    }, rest), children);
  }

  // ClaudeBadge — pill in fg-700 outline, claude orange accent.
  function ClaudeBadge() {
    return /*#__PURE__*/React.createElement("a", {
      className: "lp-claude-badge",
      href: "https://anthropic.com",
      target: "_blank",
      rel: "noopener noreferrer",
      "aria-label": "Claude Certified Architect"
    }, /*#__PURE__*/React.createElement(ClaudeGlyph, null), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: 'var(--fg-500)',
        lineHeight: 1
      }
    }, "Claude"), /*#__PURE__*/React.createElement("span", {
      style: {
        width: 1,
        height: 10,
        background: 'var(--fg-800)'
      }
    }), /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 11,
        color: 'var(--claude)',
        lineHeight: 1,
        whiteSpace: 'nowrap'
      }
    }, "Certified Architect"));
  }

  // Tech chip — mono, faint.
  function TechChip({
    children
  }) {
    return /*#__PURE__*/React.createElement("span", {
      className: "lp-chip"
    }, children);
  }

  // ─── Icons (inline SVG, Font-Awesome-flavored) ────────────────────────
  const Icon = ({
    d,
    viewBox = '0 0 512 512',
    size = 14,
    color = 'currentColor',
    style
  }) => /*#__PURE__*/React.createElement("svg", {
    width: size,
    height: size,
    viewBox: viewBox,
    fill: color,
    style: {
      flexShrink: 0,
      ...style
    }
  }, /*#__PURE__*/React.createElement("path", {
    d: d
  }));

  // FontAwesome free-solid path data (extracted)
  const ICONS = {
    // Bolt
    bolt: 'M0 256L28.5 28C30.6 11.6 44.5 0 60.6 0c8.8 0 16.7 4.7 21.1 12L221.7 256H348c8.8 0 16 7.2 16 16c0 4.3-1.7 8.5-4.8 11.5L97.1 510.5c-5.6 5.4-13.5 8.5-21.5 8.5C58.8 519 45.8 506.4 45.8 491c0-3.3 .5-6.5 1.4-9.5L99.7 320H32c-17.7 0-32-14.3-32-32z',
    user: 'M256 288A144 144 0 1 0 256 0a144 144 0 1 0 0 288zm-94.7 32C72.2 320 0 392.2 0 481.3c0 17 13.8 30.7 30.7 30.7H481.3c17 0 30.7-13.8 30.7-30.7C512 392.2 439.8 320 350.7 320H161.3z',
    wrench: 'M352 320c88.4 0 160-71.6 160-160c0-15.3-2.2-30.1-6.2-44.2c-3.1-10.8-16.4-13.2-24.3-5.3l-76.8 76.8c-3 3-7.1 4.7-11.3 4.7H336c-8.8 0-16-7.2-16-16V118.6c0-4.2 1.7-8.3 4.7-11.3l76.8-76.8c7.9-7.9 5.4-21.2-5.3-24.3C382.1 2.2 367.3 0 352 0C263.6 0 192 71.6 192 160c0 19.1 3.4 37.5 9.5 54.5L19.9 396.1C7.2 408.8 0 426.1 0 444.1C0 481.6 30.4 512 67.9 512c18 0 35.3-7.2 48-19.9L297.5 310.5c17 6.2 35.4 9.5 54.5 9.5z',
    folder: 'M0 96C0 60.7 28.7 32 64 32H196.1c19.1 0 37.4 7.6 50.9 21.1L289.9 96H448c35.3 0 64 28.7 64 64V416c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V96z',
    briefcase: 'M184 48H328c4.4 0 8 3.6 8 8V96H176V56c0-4.4 3.6-8 8-8zm-56 8V96H64C28.7 96 0 124.7 0 160v96H192 320 512V160c0-35.3-28.7-64-64-64H384V56c0-30.9-25.1-56-56-56H184c-30.9 0-56 25.1-56 56zM512 288H320v32c0 17.7-14.3 32-32 32H224c-17.7 0-32-14.3-32-32V288H0V416c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V288z',
    grad: 'M243.4 2.6l-224 96c-14 6-19.6 22.4-13.6 36.4s22.4 19.6 36.4 13.6L256 73.4l213.7 91.6L256 220.6 75.4 158.4c-14-4.8-29.4 2.6-34.2 16.6s2.6 29.4 16.6 34.2L256 277.1l213.7-67.8L420 233.6c11.5 5 22 11 30 18.2v-1.2c0-13.4-6.7-25.9-17.8-33.3l-188-126.2C262.3 89.5 256 86.8 256 86.8s-6.3 2.7-11.2 6.4l-188 126.2C45.7 226.7 39 239.2 39 252.6c0 36.3 32.4 65.4 64 86.4l102 68c10 6.7 21.7 10 32 10s22-3.4 32-10l102-68c.8-.5 1.6-1.1 2.4-1.6V461c0 14.6 11.4 26.4 25.2 27.7c1 5.7 7.2 9.7 13.5 9.7l4.6 0c6.3 0 12.5-4 13.5-9.7C440.6 487.4 452 475.6 452 461V302.7c0-3.2-.4-6.3-1.2-9.3c-6.6-25.2-29.7-44.7-58.3-44.7c-14.5 0-28.3 5.1-39.2 13.9c-12.4 9.9-21.3 23.7-25.4 39.2c-1.7 6.7-3 13.4-3.7 20.4c-.7 7.3-1.1 14.7-1.1 22.1c0 18 4 35.4 11.5 50.7c-13.6 4.6-28.1 7-43.1 7c-14.8 0-29.1-2.3-42.5-6.8c6.7-13.9 10.4-29.4 10.4-45.7c0-7.4-.4-14.8-1.1-22.1c-.7-7-2-13.7-3.7-20.4c-4.1-15.5-13-29.3-25.4-39.2c-10.9-8.8-24.7-13.9-39.2-13.9c-28.6 0-51.7 19.5-58.3 44.7c-.8 3-1.2 6.1-1.2 9.3V461c0 7.8 5.1 14.5 12 16.7v0z',
    // Reuse simpler grad cap path
    envelope: 'M48 64C21.5 64 0 85.5 0 112c0 15.1 7.1 29.3 19.2 38.4L236.8 313.6c11.4 8.5 27 8.5 38.4 0L492.8 150.4c12.1-9.1 19.2-23.3 19.2-38.4c0-26.5-21.5-48-48-48H48zM0 176V384c0 35.3 28.7 64 64 64H448c35.3 0 64-28.7 64-64V176L294.4 339.2c-22.8 17.1-54 17.1-76.8 0L0 176z',
    link: 'M579.8 267.7c56.5-56.5 56.5-148 0-204.5c-50-50-128.8-56.5-186.3-15.4l-1.6 1.1c-14.4 10.3-17.7 30.3-7.4 44.6s30.3 17.7 44.6 7.4l1.6-1.1c32.1-22.9 76-19.3 103.8 8.6c31.5 31.5 31.5 82.5 0 114L422.3 334.8c-31.5 31.5-82.5 31.5-114 0c-27.9-27.9-31.5-71.8-8.6-103.8l1.1-1.6c10.3-14.4 6.9-34.4-7.4-44.6s-34.4-6.9-44.6 7.4l-1.1 1.6C206.5 251.2 213 330 263 380c56.5 56.5 148 56.5 204.5 0L579.8 267.7zM60.2 244.3c-56.5 56.5-56.5 148 0 204.5c50 50 128.8 56.5 186.3 15.4l1.6-1.1c14.4-10.3 17.7-30.3 7.4-44.6s-30.3-17.7-44.6-7.4l-1.6 1.1c-32.1 22.9-76 19.3-103.8-8.6C74 372 74 321 105.5 289.5L217.7 177.2c31.5-31.5 82.5-31.5 114 0c27.9 27.9 31.5 71.8 8.6 103.9l-1.1 1.6c-10.3 14.4-6.9 34.4 7.4 44.6s34.4 6.9 44.6-7.4l1.1-1.6C433.5 260.8 427 182 377 132c-56.5-56.5-148-56.5-204.5 0L60.2 244.3z',
    file: 'M0 64C0 28.7 28.7 0 64 0H224V128c0 17.7 14.3 32 32 32H384V448c0 35.3-28.7 64-64 64H64c-35.3 0-64-28.7-64-64V64zm384 64H256V0L384 128z',
    trash: 'M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z',
    game: 'M192 64C86 64 0 150 0 256S86 448 192 448H448c106 0 192-86 192-192s-86-192-192-192H192zM496 168a40 40 0 1 1 0 80 40 40 0 1 1 0-80zM392 304a40 40 0 1 1 80 0 40 40 0 1 1 -80 0zM168 200c0-13.3 10.7-24 24-24s24 10.7 24 24v32h32c13.3 0 24 10.7 24 24s-10.7 24-24 24H216v32c0 13.3-10.7 24-24 24s-24-10.7-24-24V280H136c-13.3 0-24-10.7-24-24s10.7-24 24-24h32V200z',
    chevron: 'M438.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-160-160c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L370.7 256 233.4 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0l160-160z',
    xmark: 'M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z',
    external: 'M320 0c-17.7 0-32 14.3-32 32s14.3 32 32 32h82.7L201.4 265.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L448 109.3V192c0 17.7 14.3 32 32 32s32-14.3 32-32V32c0-17.7-14.3-32-32-32H320zM80 32C35.8 32 0 67.8 0 112V432c0 44.2 35.8 80 80 80H400c44.2 0 80-35.8 80-80V320c0-17.7-14.3-32-32-32s-32 14.3-32 32V432c0 8.8-7.2 16-16 16H80c-8.8 0-16-7.2-16-16V112c0-8.8 7.2-16 16-16H192c17.7 0 32-14.3 32-32s-14.3-32-32-32H80z',
    github: 'M165.9 397.4c0 2-2.3 3.6-5.2 3.6c-3.3 .3-5.6-1.3-5.6-3.6c0-2 2.3-3.6 5.2-3.6c3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9c2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5 .3-6.2 2.3zm44.2-1.7c-2.9 .7-4.9 2.6-4.6 4.9c.3 2 2.9 3.3 5.9 2.6c2.9-.7 4.9-2.6 4.6-4.6c-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2c12.8 2.3 17.3-5.6 17.3-12.1c0-6.2-.3-40.4-.3-61.4c0 0-70 15-84.7-29.8c0 0-11.4-29.1-27.8-36.6c0 0-22.9-15.7 1.6-15.4c0 0 24.9 2 38.6 25.8c21.9 38.6 58.6 27.5 72.9 20.9c2.3-16 8.8-27.1 16-33.7c-55.9-6.2-112.3-14.3-112.3-110.5c0-27.5 7.6-41.3 23.6-58.9c-2.6-6.5-11.1-33.3 2.6-67.9c20.9-6.5 69 27 69 27c20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27c13.7 34.7 5.2 61.4 2.6 67.9c16 17.7 25.8 31.5 25.8 58.9c0 96.5-58.9 104.2-114.8 110.5c9.2 7.9 17 22.9 17 46.4c0 33.7-.3 75.4-.3 83.6c0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252C496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3 .7 5.2c1.6 1.6 3.9 2.3 5.2 1c1.3-1 1-3.3-.7-5.2c-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3 .3 2.9 2.3 3.9c1.6 1 3.6 .7 4.3-.7c.7-1.3-.3-2.9-2.3-3.9c-2-.6-3.6-.3-4.3 .7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2c2.3 2.3 5.2 2.6 6.5 1c1.3-1.3 .7-4.3-1.3-6.2c-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9c1.6 2.3 4.3 3.3 5.6 2.3c1.6-1.3 1.6-3.9 0-6.2c-1.4-2.3-4-3.3-5.6-2z',
    linkedin: 'M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z'
  };
  function ClaudeGlyph() {
    return /*#__PURE__*/React.createElement("svg", {
      width: "13",
      height: "13",
      viewBox: "0 0 24 24",
      fill: "var(--claude)",
      style: {
        flexShrink: 0
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: "M4.71 13.96l3.05-1.71.05-.15-.05-.08H7.6l-1.04-.06-3.55-.1-3.08-.18-.79-.18-.74-.93.08-.5.66-.45.95.08 2.1.14 3.16.22 2.29.14 3.4.36h.54l.08-.22-.18-.13-.14-.13-3.2-2.17-3.46-2.3-1.82-1.31-.99-.67-.5-.63-.22-1.4 1.04-1.14 1.4.1.36.1 1.42 1.09 3.04 2.36 3.97 2.93.58.49.24-.17v-.21L9 11.8l-.62-3.45-.18-1.74-.18-1.34.36-1.69.96-.62 2.34.04 2.16 1.81 3.34 2.85.5.42.08-.04.08-.36-1.32-3.96-.86-2.59-.16-.94-.54-1.42.42-1.46.62-.04.4.4.66 2.8.94 1.34 1.34 4.69.42 1.32.18 1.78.04 1.78.78 2.7.18 1.83.42 2.16-3.04 2.99-1.34 1.06-3.62-1.41-.42-.36-.04-.42.36-.42 2.41-.84 3.04-.99.91-.84-.5-1.36-1.34-.04-3.94-3.86-2.16-2.99-2.27-2.07-1.78.5-.04 1.36-.18 5.13-.04 3.34-1.06.78z"
    }));
  }
  Object.assign(window, {
    AnimatedTitle,
    SectionLabel,
    Reveal,
    ClaudeBadge,
    TechChip,
    Icon,
    ICONS,
    ClaudeGlyph
  });
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/portfolio/components.jsx", error: String((e && e.message) || e) }); }

// ui_kits/portfolio/data.js
try { (() => {
// ─── Portfolio data ─────────────────────────────────────────────────
// Lifted from lkzppm/portifolio data/portfolio.ts
// Edit one place to update the whole UI kit demo.

window.PortfolioData = {
  personalInfo: {
    name: 'Lucas Pacheco',
    role: 'AI Engineer',
    location: 'Rio de Janeiro, Brazil',
    email: 'lucasppmc@gmail.com',
    github: 'https://github.com/lkzppm',
    githubHandle: 'github.com/lkzppm',
    linkedin: 'https://linkedin.com/in/lucasppmc',
    linkedinHandle: 'linkedin.com/in/lucasppmc',
    tagline: 'Building real AI solutions for real business problems.',
    about: {
      headline: 'I build production AI systems that ship — from MCP servers to RAG pipelines to LLM agents.',
      body: "Specialized in LLMs, LangChain, and Model Context Protocol. I've built RAG chatbots, network monitoring pipelines, and AI agents for enterprise clients. Currently deepening expertise in LLMOps, AI agents, and deployed Python systems.",
      status: 'Open to opportunities',
      education: 'Computer Engineering @ UERJ'
    }
  },
  projects: [{
    id: 'oracly',
    title: 'Oracly',
    description: 'Enterprise AI chatbot with RAG for internal knowledge bases. Runs locally for security.',
    techStack: ['Python', 'LangChain', 'FAISS', 'FastAPI'],
    image: '../../assets/Oracly.jpeg',
    featured: true
  }, {
    id: 'tasker',
    title: 'Tasker',
    description: 'Database management system that replaced Excel workflows with proper tooling.',
    techStack: ['FastAPI', 'React', 'PostgreSQL'],
    image: '../../assets/Tasker.png',
    featured: false
  }, {
    id: 'csn',
    title: 'CSN Analytics',
    description: 'Steel defect detection and cutting optimization for manufacturing.',
    techStack: ['Python', 'Pandas', 'ML'],
    image: '../../assets/csn.jpeg',
    featured: false
  }],
  skillCategories: [{
    title: 'AI & ML',
    skills: ['LangChain', 'RAG', 'LLM Agents', 'MCP', 'OpenAI', 'Anthropic', 'LlamaIndex', 'LLMOps']
  }, {
    title: 'Backend',
    skills: ['Python', 'Java', 'FastAPI', 'Node.js', 'TypeScript']
  }, {
    title: 'Data',
    skills: ['PostgreSQL', 'FAISS', 'Pinecone', 'Chroma', 'PySpark']
  }, {
    title: 'Tools',
    skills: ['Git', 'Docker', 'Kubernetes', 'Linux', 'MLOps', 'CI/CD']
  }],
  experiences: [{
    id: 'oceanpact',
    title: 'AI Developer',
    organization: 'OceanPact',
    period: '2026 — Present',
    description: 'Developing AI-powered solutions for maritime operations. Building LLM integrations and automation tools in a production hybrid environment.',
    current: true
  }, {
    id: 'mundivox',
    title: 'DataCenter Operations Analyst',
    organization: 'Mundivox',
    period: '2024 — 2025',
    description: 'Built RAG chatbot for internal knowledge retrieval, network monitoring pipelines with automated incident analysis, and LLM-powered alerting systems in production.',
    current: false
  }, {
    id: 'cbpf',
    title: 'AI Researcher',
    organization: 'CBPF',
    period: '2023 — 2024',
    description: 'Designed Python automation pipelines for real-time data processing. Prototyped ML models and built ETL workflows for physics research datasets.',
    current: false
  }],
  certifications: [{
    name: 'Model Context Protocol: Advanced Topics',
    issuer: 'Anthropic'
  }, {
    name: 'Introduction to Model Context Protocol',
    issuer: 'Anthropic'
  }, {
    name: 'Claude Code in Action',
    issuer: 'Anthropic'
  }, {
    name: 'AI Fluency Framework & Foundations',
    issuer: 'Anthropic'
  }, {
    name: 'CS50P',
    issuer: 'Harvard University'
  }, {
    name: 'Artificial Intelligence Fundamentals',
    issuer: 'IBM'
  }]
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/portfolio/data.js", error: String((e && e.message) || e) }); }

})();
