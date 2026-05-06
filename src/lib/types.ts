export type Rep = {
  name: string;
  sc_id: string | null;
};

export type Asset = {
  id: string;
  title: string;
  url: string;
  description: string | null;
  tags: string[];
  shareable: boolean;
  created_at: string;
  updated_at: string;
};
