export type ApiStatus = "ACTIVE" | "NON_ACTIVE" | "MAINTENANCE";
export type ApiCategory = "DOWNLOADER" | "DOWNLOADER_CHECKER" | "CHECKER_INFO" | "INFORMASI";

export type ApiDocs = {
  tutorial?: string;
  exampleRequest: string;
  successResponse: Record<string, unknown>;
  errorResponse: Record<string, unknown>;
};

export type MarketplaceApi = {
  id: string;
  slug: string;
  name: string;
  category: ApiCategory;
  status: ApiStatus;
  path: string;
  description: string;
  sampleQuery: string;
  docs: ApiDocs;
};

export type ApiCatalogDefinition = Omit<MarketplaceApi, "status"> & {
  defaultStatus: ApiStatus;
};

export const API_CATALOG_DEFINITIONS: ApiCatalogDefinition[] = [
  {
    id: "country-time",
    slug: "country-time",
    name: "Waktu negara",
    category: "INFORMASI",
    path: "/api/country-time",
    description: "Mengambil waktu lokal berdasarkan kode negara (ISO-2).",
    sampleQuery: "country=id&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/country-time?country=id&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: [
          {
            country: "ID",
            timezone: "Asia/Jakarta",
            day_name: "Monday",
            local_date: "2026-02-23",
            local_time: "13:20:01",
            utc_offset: "GMT+7",
            unix: 1771827601,
          },
        ],
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 401,
        creator: "JzProject",
        message: "Invalid API key.",
      },
    },
  },
  {
    id: "soundclouddl",
    slug: "soundcloud-dl",
    name: "SoundCloud Downloader",
    category: "DOWNLOADER",
    path: "/api/soundclouddl",
    description: "Download link extractor untuk SoundCloud track/playlist via downcloudme.",
    sampleQuery:
      "url=https%3A%2F%2Fsoundcloud.com%2Fmelanielouis%2Fsets%2Frain-sounds&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest:
        "GET /api/soundclouddl?url=https%3A%2F%2Fsoundcloud.com%2Fmelanielouis%2Fsets%2Frain-sounds&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: [
          {
            title: "Rain Sounds",
            image: "https://i1.sndcdn.com/artworks-example.jpg",
            duration: "3:42",
            likes: "1.2K",
            download_url: "https://downcloudme.com/download/file-example",
          },
        ],
        total_tracks: 1,
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'url' must be a valid SoundCloud URL.",
      },
    },
  },
  {
    id: "smuledl",
    slug: "smule-dl",
    name: "Smule Downloader",
    category: "DOWNLOADER",
    path: "/api/smuledl",
    description: "Download audio/video dari link Smule via sownloader.com.",
    sampleQuery: "url=https%3A%2F%2Fwww.smule.com%2Fsong%2Fexample&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      tutorial: [
        "Endpoint ini mengambil metadata dan link download dari URL Smule.",
        "",
        "Parameter:",
        "- url (wajib): link Smule",
        "- apikey (wajib): API key user",
        "",
        "Contoh request:",
        "GET /api/smuledl?url=https%3A%2F%2Fwww.smule.com%2Fsong%2Fexample&apikey=YOUR_API_KEY",
      ].join("\n"),
      exampleRequest:
        "GET /api/smuledl?url=https%3A%2F%2Fwww.smule.com%2Fsong%2Fexample&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          source_url: "https://www.smule.com/song/example",
          metadata: {
            title: "Sample Smule Song",
            smule_link: "https://www.smule.com/song/example",
            thumbnail: "https://sownloader.com/images/sample.jpg",
            description: "Sample description",
          },
          audio: {
            m4a: "https://sownloader.com/downloads/sample.m4a",
            mp3: "https://sownloader.com/system/modules/downloader.php?url=...",
          },
          video: {
            mp4: "https://sownloader.com/downloads/sample.mp4",
          },
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 404,
        creator: "JzProject",
        message: "No downloadable media found.",
      },
    },
  },
  {
    id: "ytdl",
    slug: "youtube-dl",
    name: "YouTube Downloader",
    category: "DOWNLOADER",
    path: "/api/ytdl",
    description: "Download video/audio YouTube multi-format via embed.dlsrv.online.",
    sampleQuery: "url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3DMRO8rWCEBmI&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest:
        "GET /api/ytdl?url=https%3A%2F%2Fyoutube.com%2Fwatch%3Fv%3DMRO8rWCEBmI&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          source_input: "https://youtube.com/watch?v=MRO8rWCEBmI",
          video_id: "MRO8rWCEBmI",
          info: {
            videoId: "MRO8rWCEBmI",
            title: "Sample YouTube Video",
            author: "Sample Channel",
            channelId: "UCxxxxxxxxxxxxxxxxxxxxxx",
            duration: 212,
            thumbnail: "https://i.ytimg.com/vi_webp/MRO8rWCEBmI/maxresdefault.webp",
          },
          formats: [
            {
              type: "video",
              quality: "1080p",
              format: "mp4",
              fileSize: 70730729,
              url: "https://yt-cdn.example/video-1080.mp4",
              filename: "sample-video-1080p.mp4",
              duration: 212,
            },
            {
              type: "audio",
              quality: "320kbps",
              format: "mp3",
              fileSize: null,
              url: "https://yt-cdn.example/audio-320.mp3",
              filename: "sample-audio-320.mp3",
              duration: 212,
            },
          ],
        },
        total_formats: 2,
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Invalid YouTube URL",
      },
    },
  },
  {
    id: "instadl",
    slug: "insta-dl",
    name: "Instagram Downloader",
    category: "DOWNLOADER",
    path: "/api/instadl",
    description: "Extract direct media download links dari postingan Instagram (reel/post).",
    sampleQuery:
      "url=https%3A%2F%2Fwww.instagram.com%2Freel%2FC0Example123%2F&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest:
        "GET /api/instadl?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FC0Example123%2F&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          source_url: "https://www.instagram.com/reel/C0Example123/",
          count: 1,
          results: [
            {
              type: "video",
              thumbnail: "https://example-cdn/thumb.jpg",
              url: "https://example-cdn/download-video.mp4",
            },
          ],
        },
        total_media: 1,
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'url' must be a valid Instagram URL.",
      },
    },
  },
  {
    id: "temp-mail",
    slug: "temp-mail",
    name: "Temp Mail Generator",
    category: "CHECKER_INFO",
    path: "/api/temp-mail",
    description: "Generate temp mail dan cek inbox menggunakan token mailbox.",
    sampleQuery: "action=generate&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      tutorial: [
        "Step 1 - Generate temp email:",
        "GET /api/temp-mail?action=generate&apikey=YOUR_API_KEY",
        "",
        "Ambil `token` dan `email` dari response.",
        "",
        "Step 2 - Cek inbox pakai token:",
        "GET /api/temp-mail?action=inbox&token=YOUR_TOKEN&apikey=YOUR_API_KEY",
        "",
        "Catatan:",
        "- `action` wajib: generate | inbox",
        "- `token` wajib kalau action=inbox",
        "- Satu request mengurangi 1 limit harian API key",
      ].join("\n"),
      exampleRequest: "GET /api/temp-mail?action=generate&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        action: "generate",
        result: {
          token: "eyJhbGciOiJIUzI....qiMq1JZqPQAfI4g",
          email: "capesa9065@bitonc.com",
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'token' is required for inbox action.",
      },
    },
  },
  {
    id: "info-krl",
    slug: "info-krl",
    name: "Info Jadwal Kereta API",
    category: "INFORMASI",
    path: "/api/info-krl",
    description: "Informasi stasiun KRL, tarif antar stasiun, dan jadwal kereta berdasarkan jam.",
    sampleQuery: "action=stations&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      tutorial: [
        "Action tersedia:",
        "- stations: daftar stasiun (opsional query=nama)",
        "- fare: tarif antar stasiun (from=...&to=...)",
        "- schedule: jadwal stasiun (station=...&timefrom=HH:MM&timeto=HH:MM)",
        "",
        "Contoh stations:",
        "GET /api/info-krl?action=stations&query=bogor&apikey=YOUR_API_KEY",
        "",
        "Contoh fare:",
        "GET /api/info-krl?action=fare&from=Bogor&to=Bekasi&apikey=YOUR_API_KEY",
        "",
        "Contoh schedule:",
        "GET /api/info-krl?action=schedule&station=Bogor&timefrom=07:00&timeto=09:00&apikey=YOUR_API_KEY",
      ].join("\n"),
      exampleRequest:
        "GET /api/info-krl?action=schedule&station=Bogor&timefrom=07:00&timeto=09:00&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          action: "schedule",
          station: {
            id: "BOO",
            name: "BOGOR",
          },
          time_from: "07:00",
          time_to: "09:00",
          total_schedule: 2,
          schedules: [
            {
              ka_name: "KA 1501",
              dest: "JAKK",
              time_est: "07:05",
              dest_time: "08:21",
            },
            {
              ka_name: "KA 1503",
              dest: "JAKK",
              time_est: "07:20",
              dest_time: "08:35",
            },
          ],
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Action 'schedule' requires valid 'timefrom' and 'timeto' format HH:MM.",
      },
    },
  },
  {
    id: "info-resi-ongkir",
    slug: "info-resi-ongkir",
    name: "Info Resi & Ongkir",
    category: "INFORMASI",
    path: "/api/info-resi-ongkir",
    description: "Cek ekspedisi, lacak resi, dan hitung ongkir antar kota/kecamatan.",
    sampleQuery: "action=ekspedisi&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      tutorial: [
        "Action tersedia:",
        "- ekspedisi: ambil daftar ekspedisi (default)",
        "- resi: lacak resi (resi + ekspedisi)",
        "- ongkir: hitung ongkir (asal + tujuan + berat dalam kg)",
        "",
        "Contoh ekspedisi:",
        "GET /api/info-resi-ongkir?action=ekspedisi&apikey=YOUR_API_KEY",
        "",
        "Contoh lacak resi:",
        "GET /api/info-resi-ongkir?action=resi&resi=JP1234567890&ekspedisi=jne&apikey=YOUR_API_KEY",
        "",
        "Contoh cek ongkir:",
        "GET /api/info-resi-ongkir?action=ongkir&asal=bogor&tujuan=bekasi&berat=1&apikey=YOUR_API_KEY",
      ].join("\n"),
      exampleRequest:
        "GET /api/info-resi-ongkir?action=resi&resi=JP1234567890&ekspedisi=jne&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          action: "resi",
          resi: "JP1234567890",
          ekspedisi: "jne",
          tracking: {
            status: "berhasil",
            details: {
              status: "DELIVERED",
              infopengiriman: "Paket sudah diterima",
              ucapan: "Selamat paket berhasil dilacak",
            },
            history: [
              {
                tanggal: "2026-02-25 10:11",
                details: "Paket diterima penerima",
              },
            ],
          },
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Action 'ongkir' requires query params 'asal', 'tujuan', and 'berat'.",
      },
    },
  },
  {
    id: "info-loker",
    slug: "info-loker",
    name: "Info Lowongan Kerja",
    category: "INFORMASI",
    path: "/api/info-loker",
    description: "Cari lowongan kerja terbaru berdasarkan kata kunci pekerjaan dan kota.",
    sampleQuery: "pekerjaan=welder&kota=Sukabumi&jumlah=5&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      tutorial: [
        "Gunakan endpoint ini untuk cari lowongan kerja dari JobStreet/SEEK API.",
        "",
        "Parameter:",
        "- pekerjaan (wajib): kata kunci pekerjaan",
        "- kota (wajib): lokasi kota",
        "- jumlah (opsional): jumlah hasil, default 10, max 25",
        "",
        "Contoh request:",
        "GET /api/info-loker?pekerjaan=welder&kota=Sukabumi&jumlah=5&apikey=YOUR_API_KEY",
      ].join("\n"),
      exampleRequest:
        "GET /api/info-loker?pekerjaan=welder&kota=Sukabumi&jumlah=5&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          pekerjaan: "welder",
          kota: "Sukabumi",
          jumlah: 5,
          total_result: 1,
          jobs: [
            {
              id: "12345678",
              title: "Welder Staff",
              company: "PT Contoh Industri",
              location: "Sukabumi, Jawa Barat",
              listing_date: "25 Feb 2026",
              salary: "Rp 5.000.000 - Rp 7.000.000",
              teaser: "Mampu membaca gambar teknik dan proses welding.",
              logo: "https://example-cdn/logo.png",
              job_url: "https://id.jobstreet.com/job/12345678",
            },
          ],
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'pekerjaan' is required.",
      },
    },
  },
  {
    id: "info-imei",
    slug: "info-imei",
    name: "Info IMEI Status",
    category: "CHECKER_INFO",
    path: "/api/info-imei",
    description: "Cek status IMEI device dari source imei.info.",
    sampleQuery: "imei=356938035643809&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      tutorial: [
        "Gunakan endpoint ini untuk cek data IMEI.",
        "",
        "Parameter:",
        "- imei (wajib): nomor IMEI (14-17 digit)",
        "- apikey (wajib): API key user",
        "",
        "Contoh request:",
        "GET /api/info-imei?imei=356938035643809&apikey=YOUR_API_KEY",
      ].join("\n"),
      exampleRequest: "GET /api/info-imei?imei=356938035643809&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          imei: "356938035643809",
          source: {
            status: "success",
            message: "ok",
          },
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'imei' must contain 14-17 digits.",
      },
    },
  },
  {
    id: "search-telech",
    slug: "search-telech",
    name: "Search Telegram Channel",
    category: "CHECKER_INFO",
    path: "/api/search-telech",
    description: "Mencari channel Telegram berdasarkan keyword dari tgramsearch.",
    sampleQuery: "query=crypto&limit=10&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      tutorial: [
        "Endpoint ini untuk mencari channel Telegram berdasarkan keyword.",
        "",
        "Parameter:",
        "- query (wajib): keyword pencarian channel",
        "- limit (opsional): jumlah hasil, default 10, max 30",
        "- apikey (wajib): API key user",
        "",
        "Contoh request:",
        "GET /api/search-telech?query=crypto&limit=10&apikey=YOUR_API_KEY",
      ].join("\n"),
      exampleRequest: "GET /api/search-telech?query=crypto&limit=10&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          query: "crypto",
          limit: 10,
          total_results: 1,
          channels: [
            {
              name: "Crypto Signals",
              link: "https://t.me/cryptosignals",
              image: "https://cdn4.cdn-telegram.org/file/example.jpg",
              members: "123,456 members",
              description: "Daily crypto signal updates.",
              category: "Cryptocurrency",
            },
          ],
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 404,
        creator: "JzProject",
        message: "No Telegram channel found.",
      },
    },
  },
  {
    id: "spotifydl",
    slug: "spotify-dl",
    name: "Spotify Downloader",
    category: "DOWNLOADER",
    path: "/api/spotifydl",
    description: "Download lagu Spotify berdasarkan track URL atau track ID.",
    sampleQuery: "url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F11dFghVXANMlKmJXsNCbNl&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest:
        "GET /api/spotifydl?url=https%3A%2F%2Fopen.spotify.com%2Ftrack%2F11dFghVXANMlKmJXsNCbNl&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          input: "https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl",
          track_id: "11dFghVXANMlKmJXsNCbNl",
          download_url: "https://cdn.example.com/spotify/song.mp3",
          download: {
            id: "11dFghVXANMlKmJXsNCbNl",
            title: "Sample Song",
            artist: "Sample Artist",
            link: "https://cdn.example.com/spotify/song.mp3",
          },
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Input must be a valid Spotify track URL or 22-char track ID.",
      },
    },
  },
  {
    id: "spotify-search",
    slug: "spotify-search",
    name: "Spotify Search",
    category: "DOWNLOADER_CHECKER",
    path: "/api/spotify-search",
    description: "Cari lagu Spotify dan ambil data track yang siap dipakai untuk download.",
    sampleQuery: "query=Bahagia%20Lagi%20Piche%20Kota&limit=20&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest:
        "GET /api/spotify-search?query=Bahagia%20Lagi%20Piche%20Kota&limit=20&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        query: "Bahagia Lagi Piche Kota",
        limit: 20,
        total_results: 1,
        result: {
          result: {
            tracks: [
              {
                id: "11dFghVXANMlKmJXsNCbNl",
                title: "Bahagia Lagi",
                artists: ["Piche Kota"],
              },
            ],
          },
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'query' is required.",
      },
    },
  },
  {
    id: "tri-check",
    slug: "tri-check",
    name: "Tri SIM Check",
    category: "CHECKER_INFO",
    path: "/api/tri-check",
    description: "Cek informasi status nomor kartu Tri (MSISDN).",
    sampleQuery: "msisdn=628973965618&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/tri-check?msisdn=628973965618&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          status: true,
          message: "Success",
          data: {
            iccid: "91540728364195207384",
            msisdn: "4730295816402",
            retDistrict: "JABODETABEK",
            actEndDate: "21-Dec-27",
            cardStatus: "Aktif",
            prodDesc: "Tri Prepaid",
            activationDate: "11-Aug-21",
            activationStatus: "Sudah Registrasi",
            frcDate: "17-Jan-26",
            responseCode: "00000",
            responseText: "Success",
          },
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'msisdn' must contain 10-16 digits.",
      },
    },
  },
  {
    id: "pindown",
    slug: "pindown",
    name: "Pinterest Downloader",
    category: "DOWNLOADER",
    path: "/api/pindown",
    description: "Download media Pinterest via pindown.io.",
    sampleQuery: "url=https%3A%2F%2Fpin.it%2F7CaDub5Qe&lang=en&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/pindown?url=https%3A%2F%2Fpin.it%2F7CaDub5Qe&lang=en&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          source_url: "https://pin.it/7CaDub5Qe",
          uploaded_by: "Uploaded by user @example",
          preview_image: "https://i.pinimg.com/564x/example.jpg",
          links: [
            {
              quality: "Image [564x]",
              url: "https://dl.pincdn.app/v2?token=example",
            },
          ],
        },
        total_links: 1,
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'url' must be a valid Pinterest URL.",
      },
    },
  },
  {
    id: "kodepos-check",
    slug: "kodepos-check",
    name: "Kode Pos Checker",
    category: "CHECKER_INFO",
    path: "/api/kodepos-check",
    description: "Pencarian kode pos Indonesia berdasarkan nama wilayah atau kode pos.",
    sampleQuery: "query=Jakarta%20Barat&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/kodepos-check?query=Jakarta%20Barat&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          totalResult: 1,
          query: "Jakarta Barat",
          results: [
            {
              kodePos: 11530,
              detailKelurahan: {
                nama: "Tomang",
                kodeKemendagri: "31.73.01.1005",
                lat: -6.17,
                lng: 106.79,
                elevasi: 12,
              },
              detailKecamatan: {
                nama: "Grogol Petamburan",
                kodeKemendagri: "31.73.01",
                zonaWaktu: "Asia/Jakarta",
              },
              detailKota: {
                nama: "Jakarta Barat",
                kodeKemendagri: "31.73",
                lat: -6.16,
                lng: 106.74,
              },
              detailProvinsi: {
                nama: "DKI Jakarta",
                kodeKemendagri: "31",
                zonaWaktu: "Asia/Jakarta",
              },
            },
          ],
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query minimal 3 karakter.",
      },
    },
  },
  {
    id: "dailymotiondl",
    slug: "dailymotion-dl",
    name: "Dailymotion Downloader",
    category: "DOWNLOADER",
    path: "/api/dailymotiondl",
    description: "Extract format download video Dailymotion via savethevideo task API.",
    sampleQuery: "url=https%3A%2F%2Fdai.ly%2Fx9zi8s0&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/dailymotiondl?url=https%3A%2F%2Fdai.ly%2Fx9zi8s0&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          source_url: "https://dai.ly/x9zi8s0",
          title: "Sample Dailymotion Video",
          duration: "1:51",
          thumbnail: "https://s1.dmcdn.net/v/sample/x1080",
          formats: [
            {
              url: "https://example-cdn/manifest.m3u8",
              quality: "hls-1080 - 1920x1080",
              resolution: "1920x1080",
            },
          ],
        },
        total_formats: 1,
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'url' must be a valid Dailymotion URL.",
      },
    },
  },
  {
    id: "cnnnews",
    slug: "cnn-news",
    name: "CNN Indonesia News",
    category: "INFORMASI",
    path: "/api/cnnnews",
    description: "Ambil berita terbaru dari cnnindonesia.com beserta detail ringkas.",
    sampleQuery: "apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/cnnnews?apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          news: [
            {
              news: {
                title: "Judul Berita CNN",
                url: "https://www.cnnindonesia.com/nasional/20260222000000-20-000000/sample-news",
                image: "https://akcdn.detik.net.id/sample.jpg",
                category: "Nasional",
              },
              detail: {
                title: "Judul Berita CNN",
                date: "Minggu, 22 Feb 2026 10:00 WIB",
                author: "cnn indonesia",
                content: ["Paragraf 1", "Paragraf 2", "Paragraf 3"],
                tags: ["Politik", "Nasional", "Berita"],
              },
            },
          ],
        },
        total_news: 1,
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'apikey' is required.",
      },
    },
  },
  {
    id: "tiktokdl",
    slug: "tiktok-dl",
    name: "TikTok Downloader",
    category: "DOWNLOADER",
    path: "/api/tiktokdl",
    description:
      "Downloader TikTok: no watermark video, no watermark video HD, watermark video, dan MP3/audio.",
    sampleQuery: "url=https%3A%2F%2Fvt.tiktok.com%2FZSxExample%2F&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/tiktokdl?url=https%3A%2F%2Fvt.tiktok.com%2FZSxExample%2F&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          source_url: "https://vt.tiktok.com/ZSxExample/",
          title: "Contoh video TikTok",
          cover: "https://p16-sign-sg.tiktokcdn.com/tos-alisg-p-0037/example.jpeg",
          images: [
            {
              index: 1,
              url: "https://p16-sign-sg.tiktokcdn.com/tos-alisg-p-0037/example-image.jpeg",
            },
          ],
          videos: {
            nowm: "https://example-cdn/video-nowm.mp4",
            nowm_hd: "https://example-cdn/video-nowm-hd.mp4",
            wm: "https://example-cdn/video-wm.mp4",
          },
          mp3: "https://example-cdn/audio.mp3",
        },
        total_images: 1,
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'url' must be a valid TikTok URL.",
      },
    },
  },
  {
    id: "apkpuredl",
    slug: "apkpure-dl",
    name: "APKPure Downloader/Searcher",
    category: "DOWNLOADER_CHECKER",
    path: "/api/apkpuredl",
    description: "Cari aplikasi di APKPure dan dapatkan direct latest APK download URL.",
    sampleQuery: "query=whatsapp&limit=20&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/apkpuredl?query=whatsapp&limit=20&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        query: "whatsapp",
        limit: 20,
        source: "apkpure-web",
        total_results: 1,
        result: [
          {
            packageName: "com.whatsapp",
            title: "WhatsApp Messenger",
            icon: "https://image.winudf.com/v2/image1/example.png",
            versionName: "2.26.1.12",
            downloadUrlFile: "https://d.apkpure.com/b/APK/com.whatsapp?version=latest",
          },
        ],
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 404,
        creator: "JzProject",
        message: "No APK result found.",
      },
    },
  },
  {
    id: "sfilemobidl",
    slug: "sfilemobi-dl",
    name: "Sfile.mobi Downloader",
    category: "DOWNLOADER",
    path: "/api/sfilemobidl",
    description: "Ambil metadata file dan direct download URL dari sfile.mobi.",
    sampleQuery: "url=https%3A%2F%2Fsfile.mobi%2Fabc12345&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/sfilemobidl?url=https%3A%2F%2Fsfile.mobi%2Fabc12345&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          source_url: "https://sfile.mobi/abc12345",
          name: "example-file.zip",
          uploaded_by: "UploaderName",
          uploaded_at: "22 Feb 2026",
          downloads: 1250,
          file_type: "ZIP",
          download_url: "https://sfile.mobi/dl/abcdef/example-file.zip",
        },
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'url' must be a valid sfile.mobi URL.",
      },
    },
  },
  {
    id: "stickerly-search",
    slug: "stickerly-search",
    name: "Sticker.ly Pack Searcher",
    category: "DOWNLOADER_CHECKER",
    path: "/api/stickerly-search",
    description: "Cari pack sticker Sticker.ly lengkap dengan resource files dan resource zip.",
    sampleQuery: "keyword=anime&limit=20&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/stickerly-search?keyword=anime&limit=20&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        query: "anime",
        limit: 20,
        total_packs: 1,
        result: [
          {
            stickerPackId: "123456789",
            title: "Anime Funny Pack",
            authorName: "Sticker User",
            resourceUrlPrefix: "https://stickerly-some-cdn/",
            resourceFiles: [
              "https://stickerly-some-cdn/sticker_1.webp",
              "https://stickerly-some-cdn/sticker_2.webp",
            ],
            resourceZip: "https://stickerly-some-cdn/pack.zip",
          },
        ],
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 404,
        creator: "JzProject",
        message: "No sticker pack found.",
      },
    },
  },
  {
    id: "genshin-profile",
    slug: "genshin-profile",
    name: "Genshin/HSR/ZZZ Profile",
    category: "CHECKER_INFO",
    path: "/api/genshin-profile",
    description: "Stalk profil akun game HoYoverse via UID (Enka Network).",
    sampleQuery: "uid=886567006&apikey=YOUR_API_KEY",
    defaultStatus: "ACTIVE",
    docs: {
      exampleRequest: "GET /api/genshin-profile?uid=886567006&apikey=YOUR_API_KEY",
      successResponse: {
        status: true,
        code: 200,
        creator: "JzProject",
        result: {
          uid: "886567006",
          playerInfo: {
            nickname: "Traveler",
            level: 60,
            signature: "Welcome to Teyvat",
            worldLevel: 8,
            achievements: 1034,
            spiralAbyss: "12-3",
            theater: "Act 8",
            stygianOnslaught: "Cleared",
            avatar: "https://enka.network/ui/UI_AvatarIcon_PlayerBoy.png",
          },
          characters: [
            {
              id: 1,
              name: "Xiao",
              level: 90,
              icon: "https://enka.network/ui/UI_AvatarIcon_Xiao.png",
              card: {
                level: 90,
                maxLevel: 90,
                friendship: 10,
                uid: "886567006",
              },
            },
          ],
        },
        total_characters: 1,
        remaining_limit: 99,
      },
      errorResponse: {
        status: false,
        code: 400,
        creator: "JzProject",
        message: "Query parameter 'uid' must contain 6-16 digits.",
      },
    },
  },
];
