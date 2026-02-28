import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';

// Static blog index — slug → metadata (newest first)
const POSTS: Record<string, { title: string; date: string; tags: string; description: string; heroImage?: string }> = {
  'attn-v3-announcement': {
    title: 'BaseMail v3: Your Inbox Is Now a Savings Account',
    date: '2026-02-28',
    tags: '$ATTN, v3, attention economy, announcement',
    description: 'Introducing $ATTN — free tokens that make spam economically irrational and good conversations literally free. All positive feedback, no punishment.',
    heroImage: '/blog/attn-v3-announcement.webp',
  },
  'who-needs-agentic-email': {
    title: 'Who Needs Agentic Email? (More People Than You Think)',
    date: '2026-02-28',
    tags: 'agentic email, use cases, AI agents, OpenClaw',
    description: 'From solo developers running OpenClaw agents to enterprises deploying agent fleets — here\'s who needs agentic email and why.',
    heroImage: '/blog/who-needs-agentic-email.webp',
  },
  'why-agents-need-email': {
    title: 'Why Your AI Agent Needs Its Own Email Address',
    date: '2026-02-28',
    tags: 'AI agents, email, identity, pain points',
    description: 'Gmail blocks bots. Sharing your inbox is a security risk. Without its own email, your agent can\'t sign up for anything.',
    heroImage: '/blog/why-agents-need-email.webp',
  },
  'attention-bonds-quadratic-funding-spam': {
    title: 'Attention Bonds: How Quadratic Funding Kills Spam',
    date: '2026-02-22',
    tags: 'attention bonds, quadratic funding, CO-QAF',
    description: 'Learn how Attention Bonds use Quadratic Funding to eliminate spam while rewarding genuine communication.',
    heroImage: '/blog/attention-bonds-quadratic-funding-spam.webp',
  },
  'basemail-vs-agentmail': {
    title: 'BaseMail vs AgentMail: Onchain Identity vs SaaS',
    date: '2026-02-22',
    tags: 'comparison, agent email, onchain identity',
    description: 'A detailed comparison of BaseMail and AgentMail approaches to AI agent email.',
    heroImage: '/blog/basemail-vs-agentmail.webp',
  },
  'erc-8004-agent-email-resolution': {
    title: 'ERC-8004: The Standard for Agent Email Resolution',
    date: '2026-02-22',
    tags: 'ERC-8004, standard, agent discovery',
    description: 'How ERC-8004 enables verifiable agent email resolution on the blockchain.',
    heroImage: '/blog/erc-8004-agent-email-resolution.webp',
  },
  'lens-protocol-agent-social-graph': {
    title: 'Lens Protocol + Agent Identity: Social Graph for AI',
    date: '2026-02-22',
    tags: 'Lens Protocol, social graph, agent identity',
    description: 'Integrating Lens Protocol social graph with AI agent identity on BaseMail.',
    heroImage: '/blog/lens-protocol-agent-social-graph.webp',
  },
  'openclaw-agent-email-tutorial': {
    title: 'How to Give Your OpenClaw Agent an Email in 2 Minutes',
    date: '2026-02-22',
    tags: 'tutorial, OpenClaw, getting started',
    description: 'Quick tutorial to set up email for your OpenClaw AI agent with BaseMail.',
    heroImage: '/blog/openclaw-agent-email-tutorial.webp',
  },
  'why-agents-need-onchain-identity': {
    title: 'Why AI Agents Need Onchain Identity (Not Just an Inbox)',
    date: '2026-02-22',
    tags: 'identity, AI agents, onchain',
    description: 'The case for onchain identity as the foundation of AI agent communication.',
    heroImage: '/blog/why-agents-need-onchain-identity.webp',
  },
};

const SLUGS = Object.keys(POSTS);

// Blog list page
function BlogIndex() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="text-gray-500 hover:text-white text-sm mb-8 inline-block">← Back to BaseMail</Link>
        <h1 className="text-4xl font-bold mb-2">Blog</h1>
        <p className="text-gray-400 mb-12">Insights on agentic email, onchain identity, and mechanism design.</p>
        <div className="space-y-8">
          {SLUGS.map(slug => {
            const p = POSTS[slug];
            return (
              <Link key={slug} to={`/blog/${slug}`} className="block group">
                <article className="border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition">
                  {p.heroImage && (
                    <div className="aspect-[3/2] overflow-hidden bg-gray-900">
                      <img
                        src={p.heroImage}
                        alt={p.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <time className="text-gray-500 text-sm">{p.date}</time>
                    <h2 className="text-xl font-semibold mt-1 group-hover:text-blue-400 transition">{p.title}</h2>
                    <p className="text-gray-400 mt-2 text-sm">{p.description}</p>
                    <div className="mt-3 flex gap-2 flex-wrap">
                      {p.tags.split(', ').slice(0, 3).map(t => (
                        <span key={t} className="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded">{t}</span>
                      ))}
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Blog post page
function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const meta = slug ? POSTS[slug] : null;

  useEffect(() => {
    if (!slug || !meta) { setLoading(false); return; }
    import(`../../content/blog/${slug}.md?raw`)
      .then(mod => {
        // Strip the frontmatter-like header (title, date, tags lines)
        let md = (mod.default || mod) as string;
        // Remove first lines that are metadata
        const lines = md.split('\n');
        let start = 0;
        for (let i = 0; i < Math.min(lines.length, 10); i++) {
          if (lines[i].startsWith('**Published') || lines[i].startsWith('**Author') || lines[i].startsWith('**Tags') || lines[i].trim() === '') {
            start = i + 1;
          } else if (i > 0 && lines[i].startsWith('#')) {
            // Keep the title
            start = i;
            break;
          }
        }
        setHtml(marked.parse(lines.slice(start).join('\n')) as string);
        setLoading(false);
      })
      .catch(() => { setHtml(''); setLoading(false); });
  }, [slug, meta]);

  if (!meta) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl font-bold text-gray-700">404</div>
          <p className="text-gray-400">Post not found.</p>
          <Link to="/blog" className="text-blue-400 hover:underline">← All posts</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/blog" className="text-gray-500 hover:text-white text-sm mb-8 inline-block">← All posts</Link>
        <article>
          {meta.heroImage && (
            <div className="aspect-[3/2] overflow-hidden rounded-xl mb-8 bg-gray-900">
              <img src={meta.heroImage} alt={meta.title} className="w-full h-full object-cover" />
            </div>
          )}
          <time className="text-gray-500 text-sm">{meta.date}</time>
          <h1 className="text-3xl font-bold mt-2 mb-8">{meta.title}</h1>
          {loading ? (
            <div className="text-gray-500">Loading...</div>
          ) : (
            <div
              className="prose prose-invert prose-gray max-w-none
                prose-headings:text-white prose-p:text-gray-300 prose-li:text-gray-300
                prose-a:text-blue-400 prose-strong:text-white prose-code:text-green-400
                prose-pre:bg-gray-900 prose-pre:border prose-pre:border-gray-800 prose-pre:rounded-xl"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </article>
        <div className="mt-12 pt-8 border-t border-gray-800">
          <Link to="/blog" className="text-gray-500 hover:text-white text-sm">← All posts</Link>
        </div>
      </div>
    </div>
  );
}

export default function Blog() {
  const { slug } = useParams<{ slug: string }>();
  return slug ? <BlogPost /> : <BlogIndex />;
}
