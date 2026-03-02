import { useEffect, useState, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { marked } from 'marked';

// Auto-import all blog posts at build time (raw strings)
const modules = import.meta.glob('../../content/blog/*.md', { as: 'raw', eager: true }) as Record<string, string>;

interface PostMeta {
  slug: string;
  title: string;
  date: string;
  author: string;
  tags: string;
  description: string;
  heroImage?: string;
}

/** Parse pseudo-frontmatter from our .md blog format */
function parseMeta(slug: string, raw: string): PostMeta {
  const lines = raw.split('\n');
  const title = (lines[0] || '').replace(/^#\s+/, '');
  let date = '', author = '', tags = '', description = '', heroImage: string | undefined;

  for (let i = 1; i < Math.min(lines.length, 12); i++) {
    const line = lines[i];
    if (line.startsWith('**Published')) date = line.replace(/.*\*\*Published:\*\*\s*/, '').trim();
    else if (line.startsWith('**Author')) author = line.replace(/.*\*\*Author:\*\*\s*/, '').trim();
    else if (line.startsWith('**Tags')) tags = line.replace(/.*\*\*Tags:\*\*\s*/, '').trim();
    else if (line.startsWith('**Description')) description = line.replace(/.*\*\*Description:\*\*\s*/, '').trim();
    else if (line.startsWith('**Hero')) heroImage = line.replace(/.*\*\*Hero(?:Image|Image):\*\*\s*/, '').trim();
  }

  // Auto-detect hero image: check /blog/<slug>.webp or .png convention
  if (!heroImage) {
    heroImage = `/blog/${slug}.webp`;
  }

  return { slug, title, date, author, tags, description, heroImage };
}

/** Build sorted post list from glob imports */
function buildPosts(): PostMeta[] {
  const posts: PostMeta[] = [];
  for (const [path, raw] of Object.entries(modules)) {
    const slug = path.split('/').pop()?.replace(/\.md$/, '') || '';
    posts.push(parseMeta(slug, raw));
  }
  // Sort by date descending, then title
  posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  return posts;
}

// Blog list page
function BlogIndex({ posts }: { posts: PostMeta[] }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="text-gray-500 hover:text-white text-sm mb-8 inline-block">← Back to BaseMail</Link>
        <h1 className="text-4xl font-bold mb-2">Blog</h1>
        <p className="text-gray-400 mb-12">Insights on agentic email, onchain identity, and mechanism design.</p>
        <div className="space-y-8">
          {posts.map(p => (
            <Link key={p.slug} to={`/blog/${p.slug}`} className="block group">
              <article className="border border-gray-800 rounded-xl overflow-hidden hover:border-gray-600 transition">
                {p.heroImage && (
                  <div className="aspect-[3/2] overflow-hidden bg-gray-900">
                    <img
                      src={p.heroImage}
                      alt={p.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
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
          ))}
        </div>
      </div>
    </div>
  );
}

// Blog post page
function BlogPost({ posts }: { posts: PostMeta[] }) {
  const { slug } = useParams<{ slug: string }>();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const meta = posts.find(p => p.slug === slug);

  useEffect(() => {
    if (!slug || !meta) { setLoading(false); return; }
    const key = Object.keys(modules).find(k => k.endsWith(`/${slug}.md`));
    if (!key) { setLoading(false); return; }

    const raw = modules[key];
    // Strip header lines (title, metadata, ---) to get body
    const lines = raw.split('\n');
    let start = 0;
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      const line = lines[i].trim();
      if (line === '---') { start = i + 1; break; }
      if (line.startsWith('**Published') || line.startsWith('**Author') ||
          line.startsWith('**Tags') || line.startsWith('**Description') ||
          line.startsWith('**Hero') || line === '' || line.startsWith('#')) {
        start = i + 1;
      }
    }
    setHtml(marked.parse(lines.slice(start).join('\n')) as string);
    setLoading(false);
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
              <img
                src={meta.heroImage}
                alt={meta.title}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
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
  const posts = useMemo(() => buildPosts(), []);
  const { slug } = useParams<{ slug: string }>();
  return slug ? <BlogPost posts={posts} /> : <BlogIndex posts={posts} />;
}
