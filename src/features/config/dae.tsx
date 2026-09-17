import type {ReactNode} from 'react';

// Colours the parts of a dae line the eye looks for: section keywords, rule conditions, outbounds, quoted
// strings and comments. Anything it does not recognise is printed as is.
export function daeLine(text: string): ReactNode {
  if (/^\s*#/.test(text)) return <span className="cmt">{text}</span>;
  const fallback = /^(\s*)fallback:\s*(\S+)\s*$/.exec(text);
  if (fallback)
    return (
      <>
        {fallback[1]}
        <span className="kw">fallback</span>: <span className="out">{fallback[2]}</span>
      </>
    );
  const section = /^(\s*)(global|dns|upstream|routing|request|response|subscription|node|group|include)(\b.*)$/.exec(text);
  if (section)
    return (
      <>
        {section[1]}
        <span className="kw">{section[2]}</span>
        {section[3]}
      </>
    );
  const rule = /^(\s*)(.+?)\s*->\s*(\S+)\s*$/.exec(text);
  if (rule)
    return (
      <>
        {rule[1]}
        <span className="arg">{rule[2]}</span> -&gt; <span className="out">{rule[3]}</span>
      </>
    );
  const value = /^(\s*)('[^']*'|[\w.-]+):\s*(.*)$/.exec(text);
  if (value)
    return (
      <>
        {value[1]}
        {value[2]}: <span className={/^'/.test(value[3]) ? 'str' : undefined}>{value[3]}</span>
      </>
    );
  return text;
}
