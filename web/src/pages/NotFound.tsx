import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="text-center space-y-6 px-6">
        <div className="text-8xl font-bold text-gray-700">404</div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-gray-400 max-w-md">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/" className="bg-base-blue text-white px-6 py-2.5 rounded-lg hover:opacity-90 transition">
            Go Home
          </Link>
          <Link to="/blog/" className="border border-gray-600 text-gray-300 px-6 py-2.5 rounded-lg hover:bg-gray-800 transition">
            Read Blog
          </Link>
        </div>
      </div>
    </div>
  );
}
