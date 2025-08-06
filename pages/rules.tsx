import { GetStaticProps } from 'next';
import fs from 'fs';
import path from 'path';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface RulesPageProps {
  content: string;
}

export const getStaticProps: GetStaticProps<RulesPageProps> = async () => {
  const filePath = path.join(process.cwd(), 'keeper_league_rulebook.md');
  const content = fs.readFileSync(filePath, 'utf-8');
  return {
    props: {
      content,
    },
  };
};

export default function RulesPage({ content }: RulesPageProps) {
  return (
    <main style={{ padding: '2rem' }}>
      <div style={{ maxWidth: '800px' }}>
        <ReactMarkdown className="markdown-body" remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    </main>
  );
} 