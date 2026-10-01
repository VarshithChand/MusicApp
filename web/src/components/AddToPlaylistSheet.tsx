import { useState } from "react";
import { usePlaylistMutations, usePlaylists } from "../api/hooks";
import { useSheet } from "../store/sheet";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { NameModal } from "./NameModal";

/** Lists the user's playlists for the song held in the sheet store (null = closed). */
export function AddToPlaylistSheet() {
  const songId = useSheet((s) => s.songId);
  const close = useSheet((s) => s.close);
  const { data: playlists, isLoading } = usePlaylists();
  const { addSong, create } = usePlaylistMutations();
  const [naming, setNaming] = useState(false);

  if (songId == null) return null;

  const add = (id: number) => addSong.mutate({ id, songId }, { onSuccess: close });
  const createAndAdd = (name: string) =>
    create.mutate(name, {
      onSuccess: (playlist) => {
        setNaming(false);
        add(playlist.id);
      },
    });

  if (naming) return <NameModal title="New playlist" confirmLabel="Create" onConfirm={createAndAdd} onClose={() => setNaming(false)} />;

  return (
    <Modal title="Add to playlist" onClose={close}>
      <button className="list-row" onClick={() => setNaming(true)}>
        <span className="tile accent">
          <Icon name="plus" />
        </span>
        <span className="song-title">New playlist</span>
      </button>
      {isLoading && <p className="muted">Loading…</p>}
      {playlists?.map((p) => (
        <button key={p.id} className="list-row" onClick={() => add(p.id)}>
          <span className="tile">
            <Icon name="library" />
          </span>
          <span className="song-text">
            <span className="song-title">{p.name}</span>
            <span className="song-sub">{p.song_count} songs</span>
          </span>
        </button>
      ))}
      {addSong.isError && <p className="error">Couldn't add the song. Try again.</p>}
    </Modal>
  );
}
