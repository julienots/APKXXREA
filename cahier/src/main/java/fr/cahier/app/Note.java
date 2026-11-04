package fr.cahier.app;

public final class Note {
    public final int id;
    public String text;
    public final long created;

    public Note(int id, String text, long created) {
        this.id = id;
        this.text = text;
        this.created = created;
    }
}
