a 3d game with multiple avatars in the same room with a lot of items and obstacles etc.
the idea is that a human gives commands to the avatars in voice, calling out their name and then what they should do. only basic verbs are preconfigured. the transcribed voice commands are passed to haiku to figure out which already existing action and item, or process etc, to take, and if no such thing exists, then asks opus to build one. this is shown somehow as "thinking this through". it shouldn't take a really long time, like far less than a minut, so opus should be prompted fairly fast. when opus answers, that new action, process, and/or item is added to the library of things and actions, and next time it is requested, there's no need to call haiku or opus. 

requesting new objects could happen parallel to the actions, and in steps that first haiku gives a rough object, and at the same time opus is designing the final one. keep things simple, but make sure they are identifiable as the objects requested.

building the engine is a big challenge and i don't know how to handle that. i do not like the idea of a fixed set of primitives that can be combined, since that defeats the inventing and requesting new things. perhaps opus outputs code that is included, and this is somehow tested and sandboxed before taken into.

store the results somewhere, so a new session after a reboot picks them up

some examples:
- "alice, throw a ball at steve" and then avatar alice finds a ball, picks it up and hurls it at steve.
- "steve, ride a bicyckle over the christmas tree", and steve does that.
- "mike, dance with the cat"
these aren't already in the library, just examples of requests that should follow this process and 

have few different room options like a outdoor playground, swimming pool area, and the forest, 
make the avatars look different. make it also possible to design new avatars with the same voice command ideas, like:
- create a new girl avatar
- give her a big curly hair like gabby
- give her a pink gown
- give her a magic wand

the target audience is ~6 year olds speaking finnish, so account for misinterpretations. then again, misinterpretation is a key part of the fun of the game. 

i like the castle-builder look and feel, camera fov and distance, etc. try to aim for that. this also means the items don't need to be perfect, since they are looked at from afar.

look at belay that for how to get voice commands and how to call claude from the game.