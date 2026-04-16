import json


async def test_health(jp_fetch):
    # When
    response = await jp_fetch("jupyterlab-export-svg-as-png-extension", "health")

    # Then
    assert response.code == 200
    payload = json.loads(response.body)
    assert payload == {
        'status': 'ok',
        'message': 'jupyterlab_export_svg_as_png_extension is active',
        'rendering': 'client-side'
    }
