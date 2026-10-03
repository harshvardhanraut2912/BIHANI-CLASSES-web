import { Bricolage_Grotesque, DM_Sans } from 'next/font/google';
import HomeNavbar from '@/components/home/HomeNavbar';
import { LegacyScripts } from '@/components/home/HomeWidgets';
import PosterCarousel from '@/components/gallery/PosterCarousel';
import AlbumGallery from '@/components/gallery/AlbumGallery';
import { getPosters, getAlbums } from '@/lib/galleryImages';
import home from '@/components/home/home.module.css';
import s from '@/components/gallery/gallery.module.css';

const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = DM_Sans({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata = {
  title: 'Gallery | Bihani Chemistry Classes, Sangamner',
  description: 'Posters, awards, achievements and photo albums from Bihani Chemistry Classes, Sangamner: MHT-CET 2026 results, classroom moments and more.',
};

export default function GalleryPage() {
  // Read from /public/images/gallery at build time (live on every request in `npm run dev`).
  const posters = getPosters();
  const albums = getAlbums().filter((a) => a.images.length > 0);
  const dev = process.env.NODE_ENV !== 'production';

  return (
    <div className={`${home.home} ${display.variable} ${body.variable}`}>
      <HomeNavbar fontClass={`${display.variable} ${body.variable}`} />

      <main className={s.page}>
        <header className={s.head}>
          <p className={s.eyebrow}>Bihani Chemistry Classes</p>
          <h1 className={s.h1}>Gallery</h1>
          <p className={s.lead}>Posters, results, awards and everyday moments from our classroom in Sangamner.</p>
          <nav className={s.jump} aria-label="Gallery sections">
            {posters.length > 0 && <a href="#posters">Posters</a>}
            {albums.length > 0 && <a href="#albums">Albums</a>}
          </nav>
        </header>

        {(posters.length > 0 || dev) && (
          <section id="posters" className={s.section}>
            <div className={s.secHead}><span className={s.secNo}>01</span><h2 className={s.h2}>Posters</h2></div>
            {posters.length > 0 ? <PosterCarousel posters={posters} /> : (
              <div className={s.empty}>Dev hint: add <code>image1.png</code>, <code>image2.png</code>… to <code>public/images/gallery/posters/</code> and the banners appear here.</div>
            )}
          </section>
        )}

        {(albums.length > 0 || dev) && (
          <section id="albums" className={s.section}>
            <div className={s.secHead}><span className={s.secNo}>02</span><h2 className={s.h2}>Albums</h2></div>
            {albums.length > 0 ? <AlbumGallery albums={albums} /> : (
              <div className={s.empty}>Dev hint: add <code>image1.png</code>, <code>image2.png</code>… to a folder like <code>public/images/gallery/albums/mht-cet-2026/</code>. Every folder becomes an album.</div>
            )}
          </section>
        )}

        {!dev && posters.length === 0 && albums.length === 0 && (
          <p className={s.soon}>Our gallery is being updated. Please check back soon.</p>
        )}
      </main>

      <footer className={s.footer}>
        <div className={s.footIn}>
          <strong>Bihani Chemistry Classes</strong>
          <span className={s.footLinks}>
            <a href="/">Home</a><a href="/cources">Courses</a><a href="/gallery">Gallery</a><a href="/contact">Contact</a>
          </span>
        </div>
        <p className={s.footCopy}>© 2026 Bihani Chemistry Classes. All rights reserved.</p>
      </footer>

      <LegacyScripts />
    </div>
  );
}
