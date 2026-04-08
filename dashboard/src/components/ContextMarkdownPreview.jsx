import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

export default function ContextMarkdownPreview({ markdown }) {
  const trimmed = String(markdown || '').trim()
  if (!trimmed) {
    return <p className="pp-muted" style={{ margin: 0, fontSize: '0.875rem' }}>Nothing to preview yet.</p>
  }

  return (
    <div className="pp-context-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  )
}
