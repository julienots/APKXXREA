package io.appxray.runtime;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ListView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

/** List screen with an adapter (sample data, to be replaced by a real source). */
public class ItemsActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Config.applyTheme(this, "Liste");
        ListView list = new ListView(this);
        setContentView(list);
        final List<String> items = new ArrayList<String>();
        for (int i = 1; i <= 30; i++) items.add("Élément " + i);
        list.setAdapter(new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, items));
        list.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                Toast.makeText(ItemsActivity.this, items.get(position), Toast.LENGTH_SHORT).show();
            }
        });
    }
}
