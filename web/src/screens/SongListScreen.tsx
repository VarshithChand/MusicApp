import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { usePlaylistMutations } from "../api/hooks";
import { Song } from "../api/types";
import { Icon } from "../components/Icon";
import { NameModal } from "../components/NameModal";
import { SongRow } from "../components/SongRow";
import { usePlayer } from "../store/player";

/** One screen for every list of songs: artist, album, playlist, liked songs. */
export function SongListScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const path = params.get("path") ?? "";
  const kind = params.get("kind");
  const id = Number(params.get("id"));
  const [title, setTitle] = useState(params.get("title") ?? "");
  const [renaming, setRenaming] = useState(false);
  const playQueue = usePlayer((s) => s.playQueue);
  const { rename, remove, removeSong } = usePlaylistMutations();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["songlist", path],
    enabled: !!path,
    queryFn: async () => {
      const res = await api<Song[] | { songs: Song[] }>(path);
      return Array.isArray(res) ? res : res.songs;
    },
  });

  const deletePlaylist = () => {
    if (confirm(`Delete playlist "${title}"?`)) remove.mutate(id, { onSuccess: () => navigate("/library") });
  };

  return (
    <div className="page">
      <div className="page-head">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          <Icon name="back" size={26} />
        </button>
        {kind === "playlist" && (
          <div className="row">
            <button className="icon-btn" onClick={() => setRenaming(true)} aria-label="Rename playlist">
              <Icon name="edit" size={22} />
            </button>
            <button className="icon-btn danger" onClick={deletePlaylist} aria-label="Delete playlist">
              <Icon name="trash" size={22} />
            </button>
          </div>
        )}
      </div>

      <div>
        <h1>{title}</h1>
        <p className="muted">{data ? `${data.length} songs` : " "}</p>
        <button className="btn primary" disabled={!data?.length} onClick={() => data && playQueue(data, 0)}>
          <Icon name="play" size={20} /> Play all
        </button>
      </div>

      <div>
        {isLoading && <p className="muted">Loading…</p>}
        {isError && <p className="error">Couldn't load songs.</p>}
        {data && !data.length && <p className="muted">Nothing here yet.</p>}
        {data?.map((s, i) => (
          <SongRow
            key={s.id}
            song={s}
            onPlay={() => playQueue(data, i)}
            onRemove={kind === "playlist" ? () => removeSong.mutate({ id, songId: s.id }) : undefined}
          />
        ))}
      </div>

      {renaming && (
        <NameModal
          title="Rename playlist"
          initial={title}
          confirmLabel="Save"
          onConfirm={(name) =>
            rename.mutate(
              { id, name },
              {
                onSuccess: () => {
                  setTitle(name);
                  setRenaming(false);
                },
              },
            )
          }
          onClose={() => setRenaming(false)}
        />
      )}
    </div>
  );
}
